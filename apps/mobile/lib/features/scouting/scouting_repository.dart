import 'dart:convert';

import '../../generated/contracts.dart';
import '../../persistence.dart';
import '../tasks/task_commands.dart';
import 'scouting_commands.dart';

class ScoutingIntent {
  const ScoutingIntent(this.id, this.status, this.data, this.result);
  final String id, status;
  final Map<String, Object?> data;
  final Map<String, Object?>? result;
  bool get attention =>
      {'conflict', 'rejected', 'actionRequired'}.contains(status);
}

class ScoutingRepository {
  ScoutingRepository(this.workspace, {required this.verify, this.loadContexts});
  final Workspace workspace;
  final OfflineGrantVerifier verify;
  final Future<List<ScoutingContext>> Function()? loadContexts;
  CommandQueue get queue =>
      workspace.commands(verify: verify, validate: validate);
  Future<List<ScoutingContext>> contexts() async {
    workspace.ensureOpen();
    return (await workspace.db.rows(
          "SELECT projection_json FROM entity_cache WHERE entity_type='ScoutingCapture' ORDER BY entity_id",
        ))
        .map(
          (r) => ScoutingContext.fromJson(
            jsonDecode(r['projection_json'] as String) as Map<String, Object?>,
          ),
        )
        .toList();
  }

  Future<void> refreshContexts() async {
    final load = loadContexts;
    if (load == null) throw StateError('CONNECTION_REQUIRED');
    final values = await load();
    workspace.ensureOpen();
    if (values.length > 1000 ||
        values.any(
          (r) =>
              !scoutingUuid.hasMatch(r.fieldSeasonId) ||
              !scoutingUuid.hasMatch(r.organizationId) ||
              !scoutingUuid.hasMatch(r.revisionId) ||
              !scoutingUuid.hasMatch(r.fieldId) ||
              !scoutingUuid.hasMatch(r.seasonId),
        )) {
      throw StateError('INVALID_CONTEXT');
    }
    await workspace.db.write(() async {
      await workspace.db.customStatement(
        "DELETE FROM entity_cache WHERE entity_type='ScoutingCapture'",
      );
      for (final r in values) {
        await workspace.db.customStatement(
          'INSERT INTO entity_cache VALUES(?,?,?,?)',
          ['ScoutingCapture', r.fieldSeasonId, jsonEncode(r.toJson()), 0],
        );
      }
    });
  }

  Future<OfflineGrant?> grant(String field) async {
    workspace.ensureOpen();
    final scope = (await workspace.db.rows(
          'SELECT scope_version FROM local_workspace WHERE id=1',
        )).single['scope_version'],
        now = DateTime.now().toUtc();
    for (final row in await workspace.db.rows(
      'SELECT snapshot_json FROM permission_snapshot',
    )) {
      final g = taskGrantFromJson(row['snapshot_json'] as String);
      if (g.risk == 'O1' &&
          g.scopeVersion == scope &&
          g.tenantId == workspace.identity.tenantId &&
          g.userId == workspace.identity.userId &&
          !now.isBefore(g.issuedAt) &&
          now.isBefore(g.expiresAt) &&
          g.allowedCommands.contains('Scouting.Capture') &&
          g.allowedOwners.contains('ScoutingCapture:$field') &&
          await verify(g)) {
        return g;
      }
    }
    return null;
  }

  Future<bool> validate(CommandDraft draft, OfflineGrant grant) async {
    if (draft.aggregateType != 'ScoutingCapture' ||
        draft.commandType != 'Scouting.Capture' ||
        draft.expectedVersion != 0) {
      return false;
    }
    try {
      final payload = jsonDecode(draft.payloadJson) as Map<String, dynamic>,
          d = ScoutingObservationData.fromJson(
            Map<String, Object?>.from(payload['data'] as Map),
          );
      validateScouting(d);
      for (final id in draft.attachmentIds) {
        final a = await workspace.attachments.get(id);
        if (a == null ||
            a['required_evidence'] != 0 ||
            a['owner_ref'] != draft.ownerRef ||
            !{'PHOTO', 'VOICE'}.contains(a['evidence_type']) ||
            (a['evidence_type'] == 'PHOTO' &&
                !{'image/jpeg', 'image/png'}.contains(a['mime'])) ||
            (a['evidence_type'] == 'VOICE' &&
                !{'audio/mpeg', 'audio/mp4'}.contains(a['mime']))) {
          return false;
        }
      }
      final c = (await contexts()).where(
            (r) =>
                r.fieldSeasonId == draft.aggregateId &&
                r.fieldSeasonId == d.fieldSeasonId &&
                r.organizationId == d.organizationId,
          ),
          expected = scoutingDraft(d, observedAt: draft.observedAt);
      return c.length == 1 &&
          expected.payloadJson == draft.payloadJson &&
          expected.projectionJson == draft.projectionJson;
    } catch (_) {
      return false;
    }
  }

  Future<String> capture(
    ScoutingObservationData d, {
    List<String> attachmentIds = const [],
  }) async {
    final g = await grant(d.fieldSeasonId);
    if (g == null) throw StateError('OFFLINE_PERMISSION_DENIED');
    final draft = scoutingDraft(d, attachmentIds: attachmentIds);
    await queue.enqueue(draft, g);
    return draft.commandId;
  }

  Future<List<ScoutingIntent>> intents() async {
    workspace.ensureOpen();
    final fields = (await contexts()).map((r) => r.fieldSeasonId).toSet(),
        rows = await workspace.db.rows(
          "SELECT q.local_command_id,q.aggregate_id,q.status,q.payload_json,r.result_json FROM sync_outbox q LEFT JOIN sync_command_result r ON r.local_command_id=q.local_command_id WHERE q.command_type='Scouting.Capture' ORDER BY q.device_seq DESC",
        );
    return rows.where((r) => fields.contains(r['aggregate_id'])).map((r) {
      final payload =
          jsonDecode(r['payload_json'] as String) as Map<String, dynamic>;
      return ScoutingIntent(
        r['local_command_id'] as String,
        r['status'] as String,
        Map<String, Object?>.from(payload['data'] as Map),
        r['result_json'] == null
            ? null
            : jsonDecode(r['result_json'] as String) as Map<String, Object?>,
      );
    }).toList();
  }
}
