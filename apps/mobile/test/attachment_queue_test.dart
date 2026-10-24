import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';

import 'support.dart';

void main() {
  late Directory root;
  late Workspace ws;
  late MemorySecrets secrets;
  const identity = WorkspaceIdentity('tenant', 'user', 'workspace');
  setUp(() async {
    root = await Directory.systemTemp.createTemp('mobile-attachments');
    secrets = MemorySecrets();
    ws = await Workspace.open(identity, root: root, secrets: secrets);
  });
  tearDown(() async {
    await ws.close();
    await root.delete(recursive: true);
  });

  Future<File> pdf(int size) async {
    final bytes = Uint8List(size)..setRange(0, 5, utf8.encode('%PDF-'));
    return File('${root.path}/source.pdf').writeAsBytes(bytes, flush: true);
  }

  Future<String> stage(File source, {bool requiredEvidence = false}) =>
      ws.attachments.stage(
        source,
        ownerRef: 'Fixture:entity',
        evidenceType: 'photo',
        mime: 'application/pdf',
        wifiOnly: true,
        requiredEvidence: requiredEvidence,
      );

  test(
    'independent durable 5 MiB queue resumes at part four after restart',
    () async {
      final source = await pdf(attachmentPartBytes * 3 + 17);
      final id = await stage(source);
      expect(await ws.attachments.readyUploads(isWifi: false), isEmpty);
      expect(
        (await ws.attachments.readyUploads(isWifi: true)).single['id'],
        id,
      );
      final row = (await ws.attachments.get(id))!;
      expect(
        row['sha256'],
        (await sha256.bind(source.openRead()).first).toString(),
      );
      expect((await ws.attachments.parts(id)).map((v) => v['size_bytes']), [
        attachmentPartBytes,
        attachmentPartBytes,
        attachmentPartBytes,
        17,
      ]);
      await ws.attachments.bindUpload(
        id,
        remoteId: 'server-file',
        session: 'upload-session',
      );
      for (final part in (await ws.attachments.parts(id)).take(3)) {
        final number = part['part_no'] as int;
        final bytes = await ws.attachments.readPart(id, number, isWifi: true);
        expect(sha256.convert(bytes).toString(), part['checksum']);
        await ws.attachments.acknowledgePart(
          id,
          number,
          session: 'upload-session',
          checksum: part['checksum'] as String,
        );
      }
      expect(await ws.commands(verify: (_) async => false).count(), 0);
      await ws.close();
      ws = await Workspace.open(identity, root: root, secrets: secrets);
      expect(
        (await ws.attachments.readyUploads(isWifi: true)).single['id'],
        id,
      );
      final pending = (await ws.attachments.parts(id))
          .where((v) => v['status'] == 'pending');
      expect(pending.single['part_no'], 4);
      expect(
        (await ws.attachments.get(id))!['upload_session'],
        'upload-session',
      );
      await expectLater(
        ws.attachments.confirmRemote(
          id,
          remoteId: 'server-file',
          checksum: row['sha256'] as String,
          remoteState: 'AVAILABLE',
        ),
        throwsStateError,
      );
      final part = pending.single;
      await ws.attachments.acknowledgePart(
        id,
        4,
        session: 'upload-session',
        checksum: part['checksum'] as String,
      );
      await expectLater(
        ws.attachments.confirmRemote(
          id,
          remoteId: 'server-file',
          checksum: row['sha256'] as String,
          remoteState: 'QUARANTINED',
        ),
        throwsStateError,
      );
      await ws.attachments.confirmRemote(
        id,
        remoteId: 'server-file',
        checksum: row['sha256'] as String,
        remoteState: 'AVAILABLE',
      );
      expect((await ws.attachments.get(id))!['upload_state'], 'confirmed');
      await ws.attachments.purgeConfirmedBytes(
        id,
        retentionBefore: DateTime.utc(2027),
      );
      expect((await ws.attachments.get(id))!['path'], '');
    },
  );

  test('AEAD tampering, Wi-Fi policy, wrong session/hash and unacked deletion fail closed', () async {
    final id = await stage(await pdf(4096));
    final row = (await ws.attachments.get(id))!;
    final path = '${ws.directory.path}/attachments/${row['path']}/1.bin';
    final cipher = await File(path).readAsBytes();
    expect(utf8.decode(cipher, allowMalformed: true), isNot(contains('%PDF-')));
    await expectLater(
      ws.attachments.readPart(id, 1, isWifi: false),
      throwsStateError,
    );
    expect(
      await ws.attachments.readPart(id, 1, isWifi: false, forceMobile: true),
      hasLength(4096),
    );
    await expectLater(
      ws.attachments.purgeConfirmedBytes(
        id,
        retentionBefore: DateTime.utc(2027),
      ),
      throwsStateError,
    );
    await ws.attachments.bindUpload(id, remoteId: 'remote', session: 'session');
    final part = (await ws.attachments.parts(id)).single;
    await expectLater(
      ws.attachments.acknowledgePart(
        id,
        1,
        session: 'stale',
        checksum: part['checksum'] as String,
      ),
      throwsStateError,
    );
    await expectLater(
      ws.attachments.acknowledgePart(
        id,
        1,
        session: 'session',
        checksum: 'bad',
      ),
      throwsStateError,
    );
    cipher[20] ^= 1;
    await File(path).writeAsBytes(cipher, flush: true);
    await expectLater(
      ws.attachments.readPart(id, 1, isWifi: true),
      throwsA(anything),
    );
    await ws.attachments.fail(id, 'HASH_MISMATCH');
    expect((await ws.attachments.get(id))!['upload_state'], 'failed');
    expect((await ws.attachments.parts(id)).single['status'], 'pending');
    expect(await File(path).exists(), true);
  });

  test('required evidence blocks delivery until AVAILABLE, owner links and metadata are immutable', () async {
    final source = await pdf(4096);
    final id = await stage(source, requiredEvidence: true);
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    CommandDraft draft(String owner) => CommandDraft.create(
      aggregateType: 'Fixture',
      aggregateId: owner,
      commandType: 'RecordFixture',
      expectedVersion: 1,
      observedAt: DateTime.utc(2026, 10, 1),
      payload: {},
      attachmentIds: [id],
    );
    await queue.enqueue(draft('entity'), testGrant(identity));
    expect(await queue.claim(), null);
    await expectLater(
      ws.attachments.stage(
        source,
        attachmentId: id,
        ownerRef: 'other',
        evidenceType: 'photo',
        mime: 'application/pdf',
      ),
      throwsStateError,
    );
    final row = (await ws.attachments.get(id))!;
    await ws.attachments.bindUpload(id, remoteId: 'remote', session: 'session');
    final part = (await ws.attachments.parts(id)).single;
    await ws.attachments.acknowledgePart(
      id,
      1,
      session: 'session',
      checksum: part['checksum'] as String,
    );
    await ws.attachments.confirmRemote(
      id,
      remoteId: 'remote',
      checksum: row['sha256'] as String,
      remoteState: 'AVAILABLE',
    );
    expect(await queue.claim(), isNotNull);
    expect(await ws.db.rows('SELECT * FROM command_attachment'), hasLength(1));
  });

  test('MIME/size validation and missing attachment reject without dangling command references', () async {
    final source = await pdf(4096);
    await expectLater(
      ws.attachments.stage(
        source,
        ownerRef: 'Fixture:entity',
        evidenceType: 'photo',
        mime: 'image/jpeg',
      ),
      throwsStateError,
    );
    await expectLater(
      ws.attachments.stage(
        source,
        ownerRef: 'Fixture:entity',
        evidenceType: 'photo',
        mime: 'application/pdf',
        maxBytes: 100,
      ),
      throwsStateError,
    );
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    final draft = CommandDraft.create(
      aggregateType: 'Fixture',
      aggregateId: 'entity',
      commandType: 'RecordFixture',
      expectedVersion: 7,
      observedAt: DateTime.utc(2026, 10, 1),
      payload: {},
      attachmentIds: ['missing'],
    );
    await expectLater(
      queue.enqueue(draft, testGrant(identity)),
      throwsStateError,
    );
    expect(await queue.count(), 0);
    expect(await ws.db.rows('SELECT * FROM local_attachment'), isEmpty);
    expect(await ws.db.rows('SELECT * FROM command_attachment'), isEmpty);
  });
}
