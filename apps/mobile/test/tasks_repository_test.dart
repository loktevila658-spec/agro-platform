import 'dart:io';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/tasks/task_repository.dart';

import 'support.dart';

const taskId = '019a4d83-0000-7000-8000-000000000001';
const taskIdentity = WorkspaceIdentity(
  'task-tenant',
  'task-user',
  'task-workspace',
);
Map<String, Object?> taskFixture() => {
  'id': taskId,
  'version': 3,
  'status': 'ASSIGNED',
  'requiresQuantity': true,
  'organizationId': 'org',
  'definition': {
    'operationTypeId': 'operation',
    'targetType': 'FIELD',
    'targetId': 'field',
    'plannedQty': '10',
    'uom': 'ha',
    'priority': 50,
  },
  'assignment': {
    'employeeIds': ['employee'],
  },
  'targetProvenance': {'id': 'field', 'revisionId': 'original'},
};
OfflineGrant taskFixtureGrant() => OfflineGrant(
  id: 'task-fixture-grant',
  tenantId: taskIdentity.tenantId,
  userId: taskIdentity.userId,
  scopeVersion: 1,
  issuedAt: DateTime.utc(2020),
  expiresAt: DateTime.utc(2100),
  allowedCommands: {
    'Task.Accept',
    'Task.Start',
    'Task.Pause',
    'Task.Resume',
    'Task.Complete',
  },
  allowedOwners: {'Task:$taskId'},
  risk: 'O1',
  signedEnvelope: 'test-only-signature',
);
Future<void> seedTask(Workspace w) async {
  await w.db.customStatement('INSERT INTO entity_cache VALUES(?,?,?,?)', [
    'Task',
    taskId,
    jsonEncode(taskFixture()),
    3,
  ]);
  await w.db.customStatement('INSERT INTO permission_snapshot VALUES(?,?)', [
    taskFixtureGrant().id,
    taskFixtureGrant().json,
  ]);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('assigned task chains durable offline commands without overwriting canonical cache', () async {
    final root = await Directory.systemTemp.createTemp('task-repository-');
    final secrets = MemorySecrets();
    final w = await Workspace.open(taskIdentity, root: root, secrets: secrets);
    try {
      await seedTask(w);
      final r = TaskRepository(w, verify: (_) async => true);
      await r.execute(taskId, 'Accept', {});
      await r.execute(taskId, 'Start', {});
      await r.execute(taskId, 'Pause', {'reason': 'Weather'});
      await r.execute(taskId, 'Resume', {});
      await r.execute(taskId, 'Complete', {'actualQty': '9.5', 'uom': 'ha'});
      expect((await r.current(taskId))!.status, 'COMPLETED');
      expect(await r.queue.count(), 5);
      final cached = await w.db.rows(
        'SELECT projection_json FROM entity_cache',
      );
      expect(
        jsonDecode(cached.single['projection_json'] as String)['status'],
        'ASSIGNED',
      );
      final commands = await w.db.rows(
        'SELECT expected_version FROM sync_outbox ORDER BY device_seq',
      );
      expect(commands.map((r) => r['expected_version']).toList(), [
        3,
        4,
        5,
        6,
        7,
      ]);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test('missing signature authorization and invalid local transitions deny before intent', () async {
    final root = await Directory.systemTemp.createTemp('task-denial-');
    final w = await Workspace.open(
      taskIdentity,
      root: root,
      secrets: MemorySecrets(),
    );
    try {
      await seedTask(w);
      final denied = TaskRepository(w, verify: (_) async => false);
      expect(denied.execute(taskId, 'Accept', {}), throwsStateError);
      final r = TaskRepository(w, verify: (_) async => true);
      expect(
        r.execute(taskId, 'Complete', {'actualQty': '2', 'uom': 'ha'}),
        throwsStateError,
      );
      expect(await r.queue.count(), 0);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test('2k cached tasks use bounded reads and verify each signed grant once', () async {
    final root = await Directory.systemTemp.createTemp('task-capacity-');
    final w = await Workspace.open(
      taskIdentity,
      root: root,
      secrets: MemorySecrets(),
    );
    try {
      await seedTask(w);
      await w.db.write(() async {
        for (var i = 1; i < 2000; i++) {
          final id =
              '019a4d83-0000-7000-8000-${(i + 1).toRadixString(16).padLeft(12, '0')}';
          final value = taskFixture()..['id'] = id;
          await w.db.customStatement(
            'INSERT INTO entity_cache VALUES(?,?,?,?)',
            ['Task', id, jsonEncode(value), 3],
          );
        }
      });
      var verifications = 0;
      final r = TaskRepository(
        w,
        verify: (_) async {
          verifications++;
          return true;
        },
      );
      final watch = Stopwatch()..start();
      expect((await r.list()).length, 2000);
      watch.stop();
      expect(verifications, 1);
      expect(watch.elapsedMilliseconds, lessThanOrEqualTo(1000));
      // Engineering runner measurement, not physical reference-device certification.
      print('Task 2k list: ${watch.elapsedMilliseconds} ms');
      await w.db.customStatement(
        'UPDATE local_workspace SET scope_version=2 WHERE id=1',
      );
      expect((await r.list()).every((v) => v.actions.isEmpty), true);
      expect(r.execute(taskId, 'Accept', {}), throwsStateError);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
}
