import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/tasks/task_repository.dart';

import 'tasks_repository_test.dart' as fixtures;
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('task intent survives restart, conflict preserves evidence and blocks automatic execution', () async {
    final root = await Directory.systemTemp.createTemp('task-restart-');
    final secrets = MemorySecrets();
    var w = await Workspace.open(
      fixtures.taskIdentity,
      root: root,
      secrets: secrets,
    );
    try {
      await fixtures.seedTask(w);
      var r = TaskRepository(w, verify: (_) async => true);
      await r.execute(fixtures.taskId, 'Accept', {});
      final before = await r.queue.claim();
      await w.close();
      w = await Workspace.open(
        fixtures.taskIdentity,
        root: root,
        secrets: secrets,
      );
      r = TaskRepository(w, verify: (_) async => true);
      expect((await r.queue.get(before!.commandId))!.expectedVersion, 3);
      // Simulates the existing receipt processor's terminal conflict state. The
      // actual canonical owner/receipt/feed path is covered by PostGIS integration.
      await w.db.customStatement(
        "UPDATE sync_outbox SET status='conflict' WHERE local_command_id=?",
        [before.commandId],
      );
      expect((await r.current(fixtures.taskId))!.status, 'ASSIGNED');
      expect((await r.list()).single.attention, true);
      await expectLater(
        r.execute(fixtures.taskId, 'Accept', {}),
        throwsStateError,
      );
      expect(await r.queue.count(), 1);
      expect(
        (await w.db.rows('SELECT * FROM provisional_projection')).length,
        1,
      );
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test(
    'accepted receipt bridges pull delay without resurrecting a purged task',
    () async {
      final root = await Directory.systemTemp.createTemp('task-receipt-');
      final w = await Workspace.open(
        fixtures.taskIdentity,
        root: root,
        secrets: MemorySecrets(),
      );
      try {
        await fixtures.seedTask(w);
        final r = TaskRepository(w, verify: (_) async => true);
        await r.execute(fixtures.taskId, 'Accept', {});
        final lease = (await r.queue.claim())!;
        final canonical = fixtures.taskFixture()
          ..['version'] = 4
          ..['status'] = 'ACCEPTED';
        await r.queue.recordServerResult(
          lease.commandId,
          lease.leaseToken!,
          state: CommandState.confirmed,
          result: {'canonical': canonical},
          serverReceivedAt: DateTime.now().toUtc(),
          canonicalVersion: 4,
        );
        expect((await r.current(fixtures.taskId))!.status, 'ACCEPTED');
        await r.execute(fixtures.taskId, 'Start', {});
        expect((await r.current(fixtures.taskId))!.version, 5);
        await w.db.customStatement(
          "DELETE FROM entity_cache WHERE entity_type='Task'",
        );
        expect(await r.current(fixtures.taskId), isNull);
        expect(await r.list(), isEmpty);
        expect(await r.queue.count(), 2);
      } finally {
        await w.close();
        await root.delete(recursive: true);
      }
    },
  );
}
