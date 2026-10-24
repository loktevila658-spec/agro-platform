import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/sync.dart';

import 'support.dart';
import 'sync_engine_test.dart' show FixtureAuthority;

class MediaAuthority implements AttachmentTransport {
  MediaAuthority(this.localId, this.hash, this.size);
  final String localId, hash;
  final int size;
  final parts = <int>[];
  bool interrupt = true;
  @override
  Future<SyncUploadResponse> init(SyncAttachmentIntent i) async =>
      SyncUploadResponse(
        attachmentId: 'remote',
        state: 'QUARANTINED',
        sizeBytes: size,
        chunkSizeBytes: 5242880,
        resumable: true,
        session: 'remote',
      );
  @override
  Future<SyncPartResponse> part(
    String local,
    String remote,
    int number,
    String checksum,
    Uint8List bytes,
  ) async {
    if (number == 4 && interrupt) {
      interrupt = false;
      throw const SyncFailure('TRANSPORT_UNAVAILABLE');
    }
    parts.add(number);
    return SyncPartResponse(
      partNumber: number,
      sha256: checksum,
      sizeBytes: bytes.length,
    );
  }

  @override
  Future<SyncAttachmentResponse> complete(String local, String remote) async =>
      SyncAttachmentResponse(
        attachmentId: remote,
        localAttachmentId: localId,
        state: 'AVAILABLE',
        sizeBytes: size,
        chunkSizeBytes: 5242880,
        resumable: true,
        sha256: hash,
        mime: 'image/jpeg',
        ownerRef: 'Fixture:entity',
        evidenceType: 'photo',
      );
}

void main() {
  test('optional delayed attachment preserves command link; upload resumes at part four after restart', () async {
    final root = await Directory.systemTemp.createTemp('sync-media');
    final secrets = MemorySecrets();
    const identity = WorkspaceIdentity('tenant', 'user', 'media');
    var ws = await Workspace.open(identity, root: root, secrets: secrets);
    final bytes = Uint8List(3 * 5242880 + 128)..setAll(0, [255, 216, 255]);
    final source = await File('${root.path}/source.jpg').writeAsBytes(bytes);
    final id = await ws.attachments.stage(
      source,
      ownerRef: 'Fixture:entity',
      evidenceType: 'photo',
      mime: 'image/jpeg',
    );
    final draft = CommandDraft.create(
      aggregateType: 'Fixture',
      aggregateId: 'entity',
      commandType: 'RecordFixture',
      expectedVersion: 7,
      observedAt: DateTime.utc(2026, 10, 1),
      payload: {'note': 'delayed photo'},
      provenance: {
        'gps': [1, 2],
      },
      attachmentIds: [id],
    );
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    await queue.enqueue(draft, testGrant(identity));
    final authority = FixtureAuthority();
    await SyncEngine(ws, queue, authority).run();
    expect(authority.received.single.attachments.single.localAttachmentId, id);
    expect((await queue.get(draft.commandId))!.state, CommandState.confirmed);
    final row = (await ws.attachments.get(id))!;
    final media = MediaAuthority(id, row['sha256'] as String, bytes.length);
    await AttachmentWorker(ws.attachments, media).run(isWifi: true);
    expect(media.parts, [1, 2, 3]);
    await ws.close();
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    await AttachmentWorker(ws.attachments, media).run(isWifi: true);
    expect(media.parts, [1, 2, 3, 4]);
    expect((await ws.attachments.get(id))!['upload_state'], 'confirmed');
    expect(
      (await ws.db.rows('SELECT * FROM command_attachment'))
          .single['attachment_id'],
      id,
    );
    await ws.close();
    await root.delete(recursive: true);
  }, timeout: const Timeout(Duration(minutes: 3)));
  test('required evidence holds device order until remote AVAILABLE, independent data never loses intent', () async {
    final root = await Directory.systemTemp.createTemp('sync-required');
    final secrets = MemorySecrets();
    const identity = WorkspaceIdentity('tenant', 'user', 'required');
    final ws = await Workspace.open(identity, root: root, secrets: secrets);
    final source = await File('${root.path}/source.jpg')
        .writeAsBytes([255, 216, 255, 0]);
    final id = await ws.attachments.stage(
      source,
      ownerRef: 'Fixture:entity',
      evidenceType: 'photo',
      mime: 'image/jpeg',
      requiredEvidence: true,
    );
    final draft = CommandDraft.create(
      aggregateType: 'Fixture',
      aggregateId: 'entity',
      commandType: 'RecordFixture',
      expectedVersion: 7,
      observedAt: DateTime.utc(2026, 10, 1),
      payload: {},
      attachmentIds: [id],
    );
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    await queue.enqueue(draft, testGrant(identity));
    await queue.enqueue(fixtureDraft(), testGrant(identity));
    expect(await queue.claim(), isNull);
    final row = (await ws.attachments.get(id))!;
    final media = MediaAuthority(id, row['sha256'] as String, 4);
    await AttachmentWorker(ws.attachments, media).run(isWifi: true);
    final authority = FixtureAuthority();
    await SyncEngine(ws, queue, authority).run();
    expect(authority.effects, 2);
    await ws.close();
    await root.delete(recursive: true);
  });
}
