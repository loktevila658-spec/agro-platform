import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:agroplatform_mobile/persistence.dart';

import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('encrypted schema2 upgrade keeps command identity, cursor, receipts and attachment bytes', () async {
    final root = await Directory.systemTemp.createTemp('map-migration');
    final secrets = MemorySecrets();
    const identity = WorkspaceIdentity('tenant', 'user', 'map-migration');
    var w = await Workspace.open(identity, root: root, secrets: secrets);
    final draft = fixtureDraft();
    await w
        .commands(verify: (_) async => true, validate: (_, _) async => true)
        .enqueue(draft, testGrant(identity));
    await w.db.customStatement(
      "INSERT INTO sync_cursor VALUES('main','preserved',42,1)",
    );
    final source = await File('${root.path}/fixture.pdf')
        .writeAsString('%PDF-test-migration-data');
    final attachment = await w.attachments.stage(
      source,
      ownerRef: 'Fixture:entity',
      evidenceType: 'photo',
      mime: 'application/pdf',
    );
    final lease = (await w.commands(verify: (_) async => true).claim())!;
    await w
        .commands(verify: (_) async => true)
        .recordServerResult(
          lease.commandId,
          lease.leaseToken!,
          state: CommandState.confirmed,
          result: {
            'status': 'ACCEPTED',
            'canonical': {'version': 8},
          },
          serverReceivedAt: DateTime.now().toUtc(),
        );
    final pending = fixtureDraft(value: 'still-pending');
    await w
        .commands(verify: (_) async => true, validate: (_, _) async => true)
        .enqueue(pending, testGrant(identity));
    final attachments = await w.db.rows('SELECT * FROM local_attachment');
    final receipts = await w.db.rows('SELECT * FROM sync_command_result');
    final before = await w.db.rows('SELECT * FROM sync_outbox');
    final directory = w.directory.path;
    await w.close();
    final raw = sqlite3.open('$directory/workspace.db');
    raw.execute("PRAGMA key='${secrets.values.values.single}'");
    raw.execute('DROP TABLE offline_package_field');
    raw.execute('DROP TABLE offline_package_state');
    raw.execute('DROP TABLE qr_unresolved');
    raw.execute('DROP TABLE qr_cache');
    raw.execute('DROP TABLE qr_issue');
    raw.execute('PRAGMA user_version=2');
    raw.execute('UPDATE local_workspace SET schema_version=2');
    raw.close();
    w = await Workspace.open(identity, root: root, secrets: secrets);
    try {
      expect((await w.db.rows('PRAGMA user_version')).single.values.single, 4);
      expect(await w.db.rows('SELECT * FROM sync_outbox'), before);
      expect(await w.db.rows('SELECT * FROM local_attachment'), attachments);
      expect(await w.db.rows('SELECT * FROM sync_command_result'), receipts);
      expect(
        await w.attachments.readPart(attachment, 1, isWifi: true),
        isNotEmpty,
      );
      expect(
        (await w.db.rows('SELECT cursor FROM sync_cursor')).single['cursor'],
        'preserved',
      );
      expect(await w.db.rows('SELECT * FROM offline_package_state'), isEmpty);
      expect(await w.db.rows('PRAGMA foreign_key_check'), isEmpty);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
}
