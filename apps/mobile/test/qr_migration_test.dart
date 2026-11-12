import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:agroplatform_mobile/persistence.dart';

import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final from in [1, 2, 3]) {
    test(
      'encrypted schema$from upgrades to4 without losing pending identity',
      () async {
        final root = await Directory.systemTemp.createTemp('qr-migration');
        final secrets = MemorySecrets();
        final identity = WorkspaceIdentity(
          'tenant',
          'user',
          'qr-migration-$from',
        );
        var workspace = await Workspace.open(
          identity,
          root: root,
          secrets: secrets,
        );
        final draft = fixtureDraft();
        await workspace
            .commands(verify: (_) async => true, validate: (_, _) async => true)
            .enqueue(draft, testGrant(identity));
        final before = await workspace.db.rows('SELECT * FROM sync_outbox');
        final directory = workspace.directory.path;
        await workspace.close();
        final raw = sqlite3.open('$directory/workspace.db');
        raw.execute("PRAGMA key='${secrets.values.values.single}'");
        raw.execute('DROP TABLE qr_cache');
        raw.execute('DROP TABLE qr_issue');
        raw.execute('DROP TABLE qr_unresolved');
        if (from < 3) {
          raw.execute('DROP TABLE offline_package_state');
          raw.execute('DROP TABLE offline_package_field');
        }
        if (from < 2) {
          for (final table in [
            'sync_cursor',
            'entity_cache',
            'entity_sync_meta',
          ]) {
            raw.execute('DROP TABLE $table');
          }
          raw.execute('DROP INDEX outbox_delivery_order');
        }
        raw.execute('PRAGMA user_version=$from');
        raw.execute('UPDATE local_workspace SET schema_version=$from');
        raw.close();
        workspace = await Workspace.open(
          identity,
          root: root,
          secrets: secrets,
        );
        try {
          expect(
            (await workspace.db.rows('PRAGMA user_version'))
                .single
                .values
                .single,
            4,
          );
          expect(await workspace.db.rows('SELECT * FROM sync_outbox'), before);
          expect(await workspace.db.rows('SELECT * FROM qr_cache'), isEmpty);
          expect(
            await workspace.db.rows('SELECT * FROM qr_unresolved'),
            isEmpty,
          );
          expect(await workspace.db.rows('PRAGMA foreign_key_check'), isEmpty);
        } finally {
          await workspace.close();
          await root.delete(recursive: true);
        }
      },
    );
  }
}
