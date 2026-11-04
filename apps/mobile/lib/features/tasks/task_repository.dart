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
  static const attentionStates = {'conflict', 'rejected', 'actionRequired'};
  static const intentQuery = '''SELECT q.aggregate_id,q.status,q.device_seq,p.projection_json,r.result_json
    FROM sync_outbox q LEFT JOIN provisional_projection p ON p.command_id=q.local_command_id
    LEFT JOIN sync_command_result r ON r.local_command_id=q.local_command_id
    WHERE q.aggregate_type='Task' ''';

  TaskProjection state(
    TaskProjection cached,
    List<Map<String, Object?>> intents,
  ) {
    var result = cached;
    // A receipt may arrive before its pull page. Display the accepted canonical
    // result without rewriting entity_cache or resurrecting a purged owner.
    for (final q in intents) {
      if (q['status'] == 'confirmed' && q['result_json'] != null) {
        final receipt =
            jsonDecode(q['result_json'] as String) as Map<String, dynamic>;
        if (receipt['canonical'] is Map) {
          final accepted = TaskProjection.fromJson(
            Map<String, Object?>.from(receipt['canonical'] as Map),
          );
          if (accepted.version > result.version) result = accepted;
        }
      }
    }
    if (intents.any((q) => attentionStates.contains(q['status']))) {
      return result;
    }
    for (final q in intents) {
      if ({'pending', 'sending', 'retryWait'}.contains(q['status']) &&
          q['projection_json'] != null) {
        final local = TaskProjection.fromJson(
          jsonDecode(q['projection_json'] as String) as Map<String, Object?>,
        );
        if (local.version > result.version) result = local;
      }
    }
    return result;
  }

  Future<TaskProjection?> current(String id) async {
    workspace.ensureOpen();
    final rows = await workspace.db.rows(
      "SELECT projection_json FROM entity_cache WHERE entity_type='Task' AND entity_id=?",
      [id],
    );
    if (rows.isEmpty) return null;
    final intents = await workspace.db.rows(
      '$intentQuery AND q.aggregate_id=? ORDER BY q.device_seq',
      [id],
    );
    return state(
      TaskProjection.fromJson(
        jsonDecode(rows.single['projection_json'] as String)
            as Map<String, Object?>,
      ),
      intents,
    );
  }

  Future<List<OfflineGrant>> activeGrants() async {
    final now = DateTime.now().toUtc();
    final scope = (await workspace.db.rows(
      'SELECT scope_version FROM local_workspace WHERE id=1',
    )).single['scope_version'];
    final snapshots = await workspace.db.rows(
      'SELECT snapshot_json FROM permission_snapshot',
    );
    final result = <OfflineGrant>[];
    for (final s in snapshots) {
      final g = taskGrantFromJson(s['snapshot_json'] as String);
      if (g.risk == 'O1' &&
          g.scopeVersion == scope &&
          g.allowedCommands.any((c) => c.startsWith('Task.')) &&
          g.tenantId == workspace.identity.tenantId &&
          g.userId == workspace.identity.userId &&
          !now.isBefore(g.issuedAt) &&
          now.isBefore(g.expiresAt) &&
          await verify(g)) {
        result.add(g);
      }
    }
    return result;
  }

  Future<OfflineGrant?> grant(String id, String action) async {
    for (final g in await activeGrants()) {
      if (g.allowedCommands.contains('Task.$action') &&
          g.allowedOwners.contains('Task:$id')) {
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
    // Bounded database round-trips for the 2k task working set. Signature checks
    // are per grant, not per task/action pair.
    final rows = await workspace.db.rows(
      "SELECT projection_json FROM entity_cache WHERE entity_type='Task' ORDER BY entity_id",
    );
    final all = await workspace.db.rows('$intentQuery ORDER BY q.device_seq');
    final byOwner = <String, List<Map<String, Object?>>>{};
    for (final q in all) {
      (byOwner[q['aggregate_id'] as String] ??= []).add(q);
    }
    final grants = await activeGrants();
    final result = <TaskView>[];
    for (final row in rows) {
      final cached = TaskProjection.fromJson(
        jsonDecode(row['projection_json'] as String) as Map<String, Object?>,
      );
      final intents = byOwner[cached.id] ?? [];
      final task = state(cached, intents);
      final pending = intents.where((q) => q['status'] != 'confirmed').toList();
      final attention = pending.any(
        (q) => attentionStates.contains(q['status']),
      );
      final actions = <String>{};
      if (!attention) {
        for (final action in (taskTransitions[task.status] ?? {}).keys) {
          if (grants.any(
            (g) =>
                g.allowedCommands.contains('Task.$action') &&
                g.allowedOwners.contains('Task:${task.id}'),
          )) {
            actions.add(action);
          }
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
