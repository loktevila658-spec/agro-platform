import 'dart:convert';

import '../../generated/contracts.dart';
import '../../persistence.dart';

final actualUuid = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);
final actualDecimal = RegExp(r'^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$');
void validateActualCapture(ActualCapture d) {
  bool id(String? s) => s != null && actualUuid.hasMatch(s);
  bool unit(String? s) => s != null && s.trim().isNotEmpty && s.length <= 16;
  if (!id(d.organizationId) ||
      !id(d.fieldSeasonId) ||
      d.sourceType != 'USER_MOBILE') {
    throw StateError('ACTUAL_CONTEXT');
  }
  if (d.taskId != null) {
    if (!id(d.taskId) ||
        [
          d.operationTypeId,
          d.startedAt,
          d.completedAt,
          d.actualQuantity,
          d.unit,
          d.executors,
        ].any((v) => v != null)) {
      throw StateError('ACTUAL_TASK_REENTRY');
    }
  } else {
    final start = DateTime.tryParse(d.startedAt ?? ''),
        end = DateTime.tryParse(d.completedAt ?? '');
    if (!id(d.operationTypeId) ||
        start == null ||
        end == null ||
        end.isBefore(start) ||
        !d.startedAt!.endsWith('Z') ||
        !d.completedAt!.endsWith('Z') ||
        !actualDecimal.hasMatch(d.actualQuantity ?? '') ||
        !unit(d.unit) ||
        d.executors == null ||
        d.executors!.isEmpty ||
        d.executors!.length > 100 ||
        d.executors!.any((v) => !id(v)) ||
        d.executors!.toSet().length != d.executors!.length) {
      throw StateError('ACTUAL_INVALID_FACT');
    }
  }
  if (d.materials.length > 100 ||
      d.labor.length > 100 ||
      d.materials.any(
        (r) =>
            !id(r.materialId) ||
            !actualDecimal.hasMatch(r.quantity) ||
            !unit(r.unit),
      ) ||
      d.labor.any(
        (r) =>
            !id(r.employeeId) ||
            !actualDecimal.hasMatch(r.quantity) ||
            !unit(r.unit),
      ) ||
      d.materials.map((r) => r.materialId).toSet().length !=
          d.materials.length ||
      d.labor.map((r) => r.employeeId).toSet().length != d.labor.length) {
    throw StateError('ACTUAL_RESOURCES');
  }
  final p = d.plannedOperation;
  if (p != null && (!id(p.mapId) || !id(p.revisionId) || !id(p.operationId))) {
    throw StateError('ACTUAL_PLAN');
  }
  if (d.comment != null &&
      (d.comment!.trim().isEmpty || d.comment!.length > 2000)) {
    throw StateError('ACTUAL_COMMENT');
  }
}

CommandDraft actualCaptureDraft(ActualCapture d, {DateTime? observedAt}) {
  validateActualCapture(d);
  final json = jsonDecode(jsonEncode(d.toJson())) as Map<String, Object?>;
  return CommandDraft.create(
    aggregateType: 'AgronomyCapture',
    aggregateId: d.fieldSeasonId,
    commandType: 'ActualOperation.Capture',
    expectedVersion: 0,
    observedAt: observedAt ?? DateTime.now().toUtc(),
    payload: {
      'data': json,
      'reason': 'Ручная регистрация выполненной операции',
    },
    provenance: {'source': 'USER_MOBILE'},
    projection: {'state': 'PENDING_SYNC', 'data': json},
  );
}
