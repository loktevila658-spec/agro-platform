import 'dart:convert';

import '../../generated/contracts.dart';
import '../../persistence.dart';

final scoutingUuid = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);
void validateScouting(ScoutingObservationData d) {
  if (!scoutingUuid.hasMatch(d.organizationId) ||
      !scoutingUuid.hasMatch(d.fieldSeasonId) ||
      d.sourceType != 'USER_MOBILE' ||
      (d.note != null && (d.note!.trim().isEmpty || d.note!.length > 4000)) ||
      !{
        'GENERAL',
        'SOIL',
        'EMERGENCE',
        'WEED',
        'PEST',
        'DISEASE',
      }.contains(d.observationType) ||
      (d.severity != null &&
          !{'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'}.contains(d.severity))) {
    throw StateError('SCOUTING_INVALID');
  }
  final l = d.location;
  if (l != null &&
      (!l.latitude.isFinite ||
          l.latitude.abs() > 90 ||
          !l.longitude.isFinite ||
          l.longitude.abs() > 180 ||
          !l.accuracyMetres.isFinite ||
          l.accuracyMetres < 0 ||
          l.provider.trim().isEmpty ||
          l.provider.length > 64 ||
          !l.observedAt.endsWith('Z') ||
          DateTime.tryParse(l.observedAt) == null)) {
    throw StateError('SCOUTING_LOCATION');
  }
  final f = d.form;
  if (f != null &&
      (!scoutingUuid.hasMatch(f.id) ||
          f.version.trim().isEmpty ||
          f.version.length > 64 ||
          f.answers.length > 100 ||
          f.answers.entries.any(
            (e) =>
                e.key.trim().isEmpty ||
                e.key.length > 64 ||
                !(e.value is String || e.value is bool || e.value is num) ||
                (e.value is num && !(e.value as num).isFinite) ||
                (e.value is String && (e.value as String).length > 2000),
          ))) {
    throw StateError('SCOUTING_FORM');
  }
}

CommandDraft scoutingDraft(
  ScoutingObservationData d, {
  DateTime? observedAt,
  List<String> attachmentIds = const [],
}) {
  validateScouting(d);
  final json = jsonDecode(jsonEncode(d.toJson())) as Map<String, Object?>;
  return CommandDraft.create(
    aggregateType: 'ScoutingCapture',
    aggregateId: d.fieldSeasonId,
    commandType: 'Scouting.Capture',
    expectedVersion: 0,
    observedAt: observedAt ?? DateTime.now().toUtc(),
    payload: {'data': json, 'reason': 'Ручное наблюдение поля'},
    provenance: {'source': 'USER_MOBILE'},
    projection: {'state': 'PENDING_SYNC', 'data': json},
    attachmentIds: attachmentIds,
  );
}
