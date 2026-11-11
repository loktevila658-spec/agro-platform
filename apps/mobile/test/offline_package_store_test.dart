import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/map/offline_package_store.dart';

import 'support.dart';
import 'offline_package_test.dart' as f;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('partial page, atomic version, reopen and scope/PURGE never resurrect stale cache', () async {
    final root = await Directory.systemTemp.createTemp('offline-gis-store');
    final secrets = MemorySecrets();
    var w = await Workspace.open(
      f.mapIdentity,
      root: root,
      secrets: secrets,
      authenticatedDeviceId: f.mapDevice,
    );
    try {
      var s = OfflinePackageStore(w);
      await f.seedMap(w, complete: false);
      await s.reconcile();
      expect((await s.snapshot()).visible, isFalse);
      await f.seedMap(w);
      await s.reconcile();
      expect(
        (await s.snapshot()).fields.single.ownerRevisionId,
        'test-revision-1',
      );
      await f.seedMap(w, version: 2, complete: false);
      await s.reconcile();
      expect((await s.snapshot()).visible, isTrue);
      expect((await s.snapshot()).manifest!.version, 1);
      expect((await s.snapshot()).fields.single.bundleVersion, 1);
      await f.seedMap(w, version: 2);
      await s.reconcile();
      expect((await s.snapshot()).fields.single.bundleVersion, 2);
      await w.close();
      w = await Workspace.open(
        f.mapIdentity,
        root: root,
        secrets: secrets,
        authenticatedDeviceId: f.mapDevice,
      );
      s = OfflinePackageStore(w);
      expect((await s.snapshot()).fields.single.bundleVersion, 2);
      await w.db.customStatement(
        "DELETE FROM entity_cache WHERE entity_type='OfflineGisField'",
      );
      expect((await s.snapshot()).visible, isFalse);
      await f.seedMap(w, version: 2);
      await w.db.customStatement('UPDATE local_workspace SET scope_version=2');
      expect((await s.snapshot()).visible, isFalse);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test(
    'failed activation transaction preserves prior pinned snapshot',
    () async {
      final root = await Directory.systemTemp.createTemp('offline-gis-fault');
      final w = await Workspace.open(
        f.mapIdentity,
        root: root,
        secrets: MemorySecrets(),
        authenticatedDeviceId: f.mapDevice,
      );
      final s = OfflinePackageStore(w);
      try {
        await f.seedMap(w);
        await s.reconcile();
        await f.seedMap(w, version: 2);
        await w.db.customStatement(
          "CREATE TRIGGER fixture_fault BEFORE INSERT ON offline_package_field BEGIN SELECT RAISE(ABORT,'test-storage-fault');END",
        );
        await expectLater(s.reconcile(), throwsA(anything));
        expect(
          (await w.db.rows('SELECT active_version FROM offline_package_state'))
              .single['active_version'],
          1,
        );
      } finally {
        await w.close();
        await root.delete(recursive: true);
      }
    },
  );
}
