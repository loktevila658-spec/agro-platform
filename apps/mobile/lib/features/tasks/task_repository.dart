import 'dart:convert';

import '../../generated/contracts.dart';
import '../../persistence.dart';
import 'task_commands.dart';

class TaskView {
  const TaskView(this.task, this.pending, this.attention, this.actions);
  final TaskProjection task;
  final int pending;
  final bool attention;
  final Set<String> actions;
}

class TaskRepository {
  TaskRepository(this.workspace, {required this.verify});
  final Workspace workspace;
  final OfflineGrantVerifier verify;
  CommandQueue get queue =>
      workspace.commands(verify: verify, validate: validate);

  Future<TaskProjection?> current(String id) async {
    workspace.ensureOpen();
    final rows = await workspace.db.rows(
      "SELECT projection_json FROM entity_cache WHERE entity_type='Task' AND entity_id=?",
      [id],
    );
    if (rows.isEmpty) return null;
    final pending = await workspace.db.rows(
      "SELECT p.projection_json FROM provisional_projection p JOIN sync_outbox q ON q.local_command_id=p.command_id WHERE q.aggregate_type='Task' AND q.aggregate_id=? AND q.status IN ('pending','sending','retryWait') ORDER BY q.device_seq DESC LIMIT 1",
      [id],
    );
    return TaskProjection.fromJson(
      jsonDecode(
        (pending.isEmpty ? rows.single : pending.single)['projection_json']
            as String,
      ) as Map<String, dynamic>,
    );
  }

  Future<OfflineGrant?> grant(String id, String action) async {
    final now = DateTime.now().toUtc();
    final snapshots = await workspace.db.rows(
      'SELECT snapshot_json FROM permission_snapshot',
    );
    for (final s in snapshots.reversed) {
      final g = taskGrantFromJson(s['snapshot_json'] as String);
      if (g.allowedCommands.contains('Task.$action') &&
          g.allowedOwners.contains('Task:$id') &&
          g.tenantId == workspace.identity.tenantId &&
          g.userId == workspace.identity.userId &&
          !now.isBefore(g.issuedAt) &&
          now.isBefore(g.expiresAt) &&
          await verify(g)) {
        return g;
      }
    }
    return null;
  }

  Future<bool> validate(CommandDraft draft, OfflineGrant grant) async {
    if (draft.aggregateType != 'Task' ||
        !draft.commandType.startsWith('Task.')) {
      return false;
    }
    final task = await current(draft.aggregateId);
    if (task == null || task.version != draft.expectedVersion) return false;
    final attention = await workspace.db.rows(
      "SELECT 1 FROM sync_outbox WHERE aggregate_type='Task' AND aggregate_id=? AND status IN ('conflict','rejected','actionRequired') LIMIT 1",
      [task.id],
    );
    if (attention.isNotEmpty) return false;
    try {
      final expected = taskDraft(
        task,
        draft.commandType.substring(5),
        jsonDecode(draft.payloadJson) as Map<String, Object?>,
        observedAt: draft.observedAt,
      );
      return expected.projectionJson == draft.projectionJson;
    } catch (_) {
      return false;
    }
  }

  Future<List<TaskView>> list() async {
    workspace.ensureOpen();
    final ids = await workspace.db.rows(
      "SELECT entity_id FROM entity_cache WHERE entity_type='Task' ORDER BY entity_id",
    );
    final result = <TaskView>[];
    for (final row in ids) {
      final task = (await current(row['entity_id'] as String))!;
      final pending = await workspace.db.rows(
        "SELECT status FROM sync_outbox WHERE aggregate_type='Task' AND aggregate_id=? AND status!='confirmed'",
        [task.id],
      );
      final attention = pending.any(
        (q) => {'conflict', 'rejected', 'actionRequired'}.contains(q['status']),
      );
      final actions = <String>{};
      if (!attention) {
        for (final action in (taskTransitions[task.status] ?? {}).keys) {
          if (await grant(task.id, action) != null) actions.add(action);
        }
      }
      result.add(TaskView(task, pending.length, attention, actions));
    }
    return result;
  }

  Future<void> execute(
    String id,
    String action,
    Map<String, Object?> payload,
  ) async {
    final task = await current(id);
    final permission = await grant(id, action);
    if (task == null || permission == null) {
      throw StateError('OFFLINE_PERMISSION_DENIED');
    }
    await queue.enqueue(taskDraft(task, action, payload), permission);
  }
}
