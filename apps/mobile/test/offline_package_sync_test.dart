import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/sync.dart';
import 'package:agroplatform_mobile/features/tasks/task_repository.dart';
import 'package:agroplatform_mobile/features/map/offline_package_controller.dart';
import 'package:agroplatform_mobile/features/map/maplibre_offline_regions.dart';
import 'package:agroplatform_mobile/features/map/offline_package.dart';

import 'support.dart';
import 'offline_package_test.dart' as f;
import 'tasks_repository_test.dart' as tasks;

class TestRegions implements OfflineRegions {
  int creates = 0;
  bool paused = false, complete = false;
  @override
  Future<int> create(
    OfflineGisManifest m, {
    void Function(String)? onError,
  }) async => ++creates;
  @override
  Future<RegionProgress> status(int id) async =>
      RegionProgress(complete ? 1 : 0.25, 64, complete);
  @override
  Future<void> pause(int id) async {
    paused = true;
  }

  @override
  Future<void> resume(int id) async {
    paused = false;
  }

  @override
  Future<void> delete(int id) async {}
  @override
  Future<void> reset() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('existing queue retains map identity/intent, real Task owner cache and receipts; actual pull PURGE hides maps', () async {
    final root = await Directory.systemTemp.createTemp('map-sync');
    final w = await Workspace.open(
      f.mapIdentity,
      root: root,
      secrets: MemorySecrets(),
      authenticatedDeviceId: f.mapDevice,
    );
    final c = OfflinePackageController(
      w,
      verify: (_) async => true,
      regions: TestRegions(),
    );
    try {
      await f.seedMapGrant(w);
      await f.seedMap(w);
      await c.reconcile();
      await c.select(f.selected());
      final q = w.commands(verify: (_) async => true, validate: c.validate);
      final lease = await q.claim();
      expect(lease, isNotNull);
      final original = lease!.commandId;
      await q.retry(
        original,
        lease.leaseToken!,
        nextRetryAt: DateTime.utc(2020),
      );
      final retried = (await q.claim())!;
      expect(retried.commandId, original);
      await q.recordServerResult(
        original,
        retried.leaseToken!,
        state: CommandState.conflict,
        result: {
          'status': 'CONFLICT',
          'canonical': {'id': f.mapDevice, 'version': 2},
        },
        serverReceivedAt: DateTime.now().toUtc(),
      );
      await c.select(f.selected());
      expect(await q.count(), 2);
      expect(
        (await w.db.rows('SELECT status FROM sync_outbox ORDER BY device_seq'))
            .first['status'],
        'conflict',
      );
      final task = tasks.taskFixture();
      final definition = Map<String, Object?>.from(task['definition'] as Map);
      definition['targetId'] = f.mapField;
      task['definition'] = definition;
      await w.db.customStatement('INSERT INTO entity_cache VALUES(?,?,?,?)', [
        'Task',
        tasks.taskId,
        canonicalJson(task),
        3,
      ]);
      final grant = tasks.taskFixtureGrant();
      final bound = OfflineGrant(
        id: grant.id,
        tenantId: f.mapIdentity.tenantId,
        userId: f.mapIdentity.userId,
        scopeVersion: 1,
        issuedAt: grant.issuedAt,
        expiresAt: grant.expiresAt,
        allowedCommands: grant.allowedCommands,
        allowedOwners: grant.allowedOwners,
        risk: grant.risk,
        signedEnvelope: grant.signedEnvelope,
      );
      await w.db.customStatement(
        'INSERT INTO permission_snapshot VALUES(?,?)',
        [bound.id, bound.json],
      );
      final repository = TaskRepository(w, verify: (_) async => true);
      await repository.execute(tasks.taskId, 'Accept', {});
      expect((await repository.current(tasks.taskId))!.status, 'ACCEPTED');
      await w.db.customStatement(
        "INSERT INTO sync_cursor VALUES('main','old',0,1)",
      );
      await PullStore(w.db).apply(
        'old',
        SyncPullResponse(
          changes: [
            SyncChange(
              seq: '1',
              entityType: 'OfflineGisPackage',
              entityId: f.mapDevice,
              op: 'PURGE',
              projection: {},
            ),
          ],
          nextCursor: 'new',
          hasMore: false,
          resetRequired: false,
        ),
      );
      await c.reconcile();
      expect(c.view.visible, isFalse);
      expect(await q.count(), 3);
    } finally {
      await c.close();
      c.dispose();
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test('bad signature/current scope cannot enqueue a map mutation', () async {
    final root = await Directory.systemTemp.createTemp('map-deny');
    final w = await Workspace.open(
      f.mapIdentity,
      root: root,
      secrets: MemorySecrets(),
      authenticatedDeviceId: f.mapDevice,
    );
    final c = OfflinePackageController(
      w,
      verify: (_) async => false,
      regions: TestRegions(),
    );
    try {
      await f.seedMapGrant(w);
      await expectLater(c.select(f.selected()), throwsStateError);
      expect(await w.db.rows('SELECT * FROM sync_outbox'), isEmpty);
    } finally {
      await c.close();
      c.dispose();
      await w.close();
      await root.delete(recursive: true);
    }
  });
}
