import 'dart:convert';

import '../../generated/contracts.dart';
import '../../persistence.dart';

const taskTransitions = <String, Map<String, String>>{
  'ASSIGNED': {'Accept': 'ACCEPTED'},
  'ACCEPTED': {'Start': 'IN_PROGRESS'},
  'IN_PROGRESS': {'Pause': 'PAUSED', 'Complete': 'COMPLETED'},
  'PAUSED': {'Resume': 'IN_PROGRESS', 'Complete': 'COMPLETED'},
};

CommandDraft taskDraft(
  TaskProjection task,
  String action,
  Map<String, Object?> payload, {
  DateTime? observedAt,
}) {
  final next = taskTransitions[task.status]?[action];
  if (next == null) throw StateError('TASK_STATE_CONFLICT');
  final allowed = action == 'Complete'
      ? {'actualQty', 'uom', 'comment'}
      : {'reason'};
  if (payload.keys.any((k) => !allowed.contains(k))) {
    throw StateError('TASK_INVALID_PAYLOAD');
  }
  if (action == 'Pause' &&
      (payload['reason'] is! String ||
          (payload['reason'] as String).trim().isEmpty)) {
    throw StateError('TASK_REASON_REQUIRED');
  }
  if (action == 'Complete') {
    final qty = payload['actualQty'];
    if ((task.requiresQuantity && qty == null) ||
        (qty != null &&
            (qty is! String ||
                !RegExp(r'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$')
                    .hasMatch(qty) ||
                payload['uom'] != task.definition.uom)) ||
        (qty == null && payload['uom'] != null)) {
      throw StateError('TASK_INVALID_COMPLETION');
    }
  }
  final at = observedAt ?? DateTime.now().toUtc();
  final projection = task.toJson()
    ..['status'] = next
    ..['version'] = task.version + 1;
  if (action == 'Start') projection['startedAt'] = at.toIso8601String();
  projection['lastObservedAt'] = at.toIso8601String();
  return CommandDraft.create(
    aggregateType: 'Task',
    aggregateId: task.id,
    commandType: 'Task.$action',
    expectedVersion: task.version,
    observedAt: at,
    payload: payload,
    provenance: {'source': 'manual'},
    projection: projection,
  );
}

OfflineGrant taskGrantFromJson(String source) {
  final g = jsonDecode(source) as Map<String, dynamic>;
  return OfflineGrant(
    id: g['id'] as String,
    tenantId: g['tenant'] as String,
    userId: g['user'] as String,
    scopeVersion: g['scopeVersion'] as int,
    issuedAt: DateTime.parse(g['issuedAt'] as String),
    expiresAt: DateTime.parse(g['expiresAt'] as String),
    allowedCommands: (g['commands'] as List).cast<String>().toSet(),
    allowedOwners: (g['owners'] as List).cast<String>().toSet(),
    risk: g['risk'] as String,
    signedEnvelope: g['signedEnvelope'] as String,
  );
}
