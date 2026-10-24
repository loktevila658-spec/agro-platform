import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:crypto/crypto.dart' show sha256;
import 'package:sqlite3/sqlite3.dart';
import 'package:agroplatform_mobile/persistence.dart';

import 'support.dart';

void main() {
  late Directory root;
  late MemorySecrets secrets;
  const identity = WorkspaceIdentity('tenant', 'user', 'workspace');
  setUp(() async {
    root = await Directory.systemTemp.createTemp('mobile-security');
    secrets = MemorySecrets();
  });
  tearDown(() async {
    await root.delete(recursive: true);
  });

  test('DB/WAL are encrypted; missing or incorrect key fails without wiping pending', () async {
    var ws = await Workspace.open(identity, root: root, secrets: secrets);
    await ws
        .commands(verify: (_) async => true, validate: (_, _) async => true)
        .enqueue(fixtureDraft(), testGrant(identity));
    final file = File('${ws.directory.path}/workspace.db');
    for (final suffix in ['', '-wal']) {
      final bytes = await File('${file.path}$suffix').readAsBytes();
      expect(
        utf8.decode(bytes, allowMalformed: true),
        isNot(contains('sensitive-offline-value')),
      );
      expect(
        bytes.take(16).toList(),
        isNot(utf8.encode('SQLite format 3\u0000')),
      );
    }
    await ws.close();
    final plain = sqlite3.open(file.path);
    expect(
      () => plain.select('SELECT * FROM sync_outbox'),
      throwsA(isA<SqliteException>()),
    );
    plain.close();
    final key = secrets.values.values.single;
    final keyName = secrets.values.keys.single;
    secrets.values.clear();
    await expectLater(
      Workspace.open(identity, root: root, secrets: secrets),
      throwsStateError,
    );
    expect(await file.exists(), true);
    secrets.values[keyName] = List.filled(64, '0').join();
    await expectLater(
      Workspace.open(identity, root: root, secrets: secrets),
      throwsA(anything),
    );
    secrets.values[keyName] = key;
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    expect(await ws.commands(verify: (_) async => false).count(), 1);
    await ws.close();
  });

  test(
    'tenant/user isolation, personal lock, and shared cryptographic wipe',
    () async {
      final first = await Workspace.open(
        identity,
        root: root,
        secrets: secrets,
      );
      final queue = first.commands(
        verify: (_) async => true,
        validate: (_, _) async => true,
      );
      await queue.enqueue(fixtureDraft(), testGrant(identity));
      final second = await Workspace.open(
        const WorkspaceIdentity('other', 'user', 'workspace'),
        root: root,
        secrets: secrets,
      );
      expect(await second.commands(verify: (_) async => false).count(), 0);
      expect(first.directory.path, isNot(second.directory.path));
      await first.close();
      await expectLater(queue.get('anything'), throwsStateError);
      final reopened = await Workspace.open(
        identity,
        root: root,
        secrets: secrets,
      );
      expect(await reopened.commands(verify: (_) async => false).count(), 1);
      final oldDirectory = reopened.directory;
      await reopened.wipeShared();
      expect(await oldDirectory.exists(), false);
      expect(secrets.values.length, 1); // only other tenant key remains
      await second.wipeShared();
      expect(secrets.values, isEmpty);
    },
  );

  test('shared wipe failure remains blocked and failed-open workspace can be explicitly purged', () async {
    final broken = RefusingDeleteSecrets();
    final ws = await Workspace.open(identity, root: root, secrets: broken);
    final directory = ws.directory;
    await expectLater(ws.wipeShared(), throwsStateError);
    expect(await directory.exists(), true);
    expect(() => ws.ensureOpen(), throwsStateError);
    // Owner-directed shared logout can still purge a database with a lost key.
    broken.values.clear();
    await expectLater(
      Workspace.open(identity, root: root, secrets: broken),
      throwsStateError,
    );
    await Workspace.wipeSharedIdentity(identity, root: root, secrets: broken);
    expect(await directory.exists(), false);
  });

  test('concurrent first open shares one key and distinct writers retain both commands', () async {
    final opened = await Future.wait([
      Workspace.open(identity, root: root, secrets: secrets),
      Workspace.open(identity, root: root, secrets: secrets),
    ]);
    expect(secrets.values.length, 1);
    final queues = opened
        .map(
          (ws) => ws.commands(
            verify: (_) async => true,
            validate: (_, _) async => true,
          ),
        )
        .toList();
    await Future.wait([
      queues[0].enqueue(fixtureDraft(value: 'one'), testGrant(identity)),
      queues[1].enqueue(fixtureDraft(value: 'two'), testGrant(identity)),
    ]);
    expect(await queues[0].count(), 2);
    expect(
      (await opened[0].db.rows(
        'SELECT device_seq FROM sync_outbox ORDER BY device_seq',
      )).map((r) => r['device_seq']),
      [1, 2],
    );
    for (final ws in opened) {
      await ws.close();
    }
  });

  test('failed first schema creation rolls back every new table and version marker', () async {
    final name = sha256.convert(utf8.encode(identity.encoded)).toString();
    final directory = await Directory('${root.path}/$name').create();
    final file = File('${directory.path}/workspace.db');
    final key = List.filled(64, 'a').join();
    secrets.values['agro.workspace.$name'] = key;
    var raw = sqlite3.open(file.path);
    raw.execute("PRAGMA key = '$key'");
    // Pre-existing v0 table forces a real DDL failure after earlier CREATEs.
    raw.execute('CREATE TABLE permission_snapshot(id TEXT PRIMARY KEY)');
    raw.close();
    await expectLater(
      Workspace.open(identity, root: root, secrets: secrets),
      throwsA(anything),
    );
    raw = sqlite3.open(file.path);
    raw.execute("PRAGMA key = '$key'");
    expect(
      raw
          .select(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          )
          .map((r) => r['name'])
          .toSet(),
      {'permission_snapshot'},
    );
    expect(raw.select('PRAGMA user_version').single.values.single, 0);
    raw.close();
  });

  test('first schema creation and every supported snapshot preserve unsynced intent', () async {
    var ws = await Workspace.open(identity, root: root, secrets: secrets);
    final draft = fixtureDraft();
    await ws
        .commands(verify: (_) async => true, validate: (_, _) async => true)
        .enqueue(draft, testGrant(identity));
    expect((await ws.db.rows('PRAGMA user_version')).single.values.single, 1);
    final before = await ws.db.rows('SELECT * FROM sync_outbox');
    final device = await ws.db.rows('SELECT * FROM local_device');
    await ws.close();
    // v1 is the first and only supported historical snapshot. Reopen uses
    // Drift migration machinery and must not recreate schema or reset sequence.
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    expect(await ws.db.rows('SELECT * FROM sync_outbox'), before);
    expect(await ws.db.rows('SELECT * FROM local_device'), device);
    expect((await ws.db.rows('PRAGMA foreign_key_check')), isEmpty);
    await ws.db.customStatement('PRAGMA user_version=2');
    await ws.close();
    await expectLater(
      Workspace.open(identity, root: root, secrets: secrets),
      throwsA(anything),
    );
  });

  test('invalid workspace keys fail before opening a database', () async {
    // The normal executor checks PRAGMA cipher in release builds. In-memory
    // plaintext is not exposed by Workspace; this test checks invalid keys early.
    expect(
      () => LocalDatabase.encrypted(File('${root.path}/bad.db'), 'unsafe'),
      throwsArgumentError,
    );
  });
}

class RefusingDeleteSecrets extends MemorySecrets {
  @override
  Future<void> delete(String key) async {}
}
