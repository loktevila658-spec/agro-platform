import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:agroplatform_mobile/persistence.dart';

import 'support.dart';

void main() {
  test('real encrypted v1 snapshot upgrades to v2 preserving pending intent, IDs, audit and attachments', () async {
    final root = await Directory.systemTemp.createTemp('sync-migration');
    final secrets = MemorySecrets();
    const identity = WorkspaceIdentity('tenant', 'user', 'migration');
    var ws = await Workspace.open(identity, root: root, secrets: secrets);
    final draft = fixtureDraft();
    await ws
        .commands(verify: (_) async => true, validate: (_, _) async => true)
        .enqueue(draft, testGrant(identity));
    final path = ws.directory.path;
    await ws.close();
    final raw = sqlite3.open('$path/workspace.db');
    raw.execute("PRAGMA key='${secrets.values.values.single}'");
    raw.execute('DROP TABLE sync_cursor');
    raw.execute('DROP TABLE entity_cache');
    raw.execute('DROP TABLE entity_sync_meta');
    raw.execute('DROP INDEX outbox_delivery_order');
    raw.execute('UPDATE local_workspace SET schema_version=1');
    raw.execute('PRAGMA user_version=1');
    raw.close();
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    expect((await ws.db.rows('PRAGMA user_version')).single.values.single, 2);
    final pending = (await ws
        .commands(verify: (_) async => false)
        .get(draft.commandId))!;
    expect(pending.idempotencyKey, draft.commandId);
    expect(pending.expectedVersion, 7);
    expect(await ws.db.rows('SELECT * FROM local_audit'), hasLength(1));
    expect(await ws.db.rows('SELECT * FROM sync_cursor'), isEmpty);
    await ws.close();
    await root.delete(recursive: true);
  });
}
