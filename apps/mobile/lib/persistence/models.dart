import 'dart:convert';

import 'package:uuid/uuid.dart';

/// Mobile stores provisional intent only. Canonical acceptance is server-owned.
enum CommandState {
  pending,
  sending,
  retryWait,
  confirmed,
  conflict,
  rejected,
  actionRequired,
}

enum QueueViewState { pending, synced, conflict, failed }

QueueViewState viewState(CommandState state) => switch (state) {
  CommandState.confirmed => QueueViewState.synced,
  CommandState.conflict => QueueViewState.conflict,
  CommandState.rejected || CommandState.actionRequired => QueueViewState.failed,
  _ => QueueViewState.pending,
};

String canonicalJson(Object? value) {
  Object? sorted(Object? item) {
    if (item is Map<String, Object?>) {
      return {
        for (final key in item.keys.toList()..sort()) key: sorted(item[key]),
      };
    }
    if (item is List) return item.map(sorted).toList();
    return item;
  }

  return jsonEncode(sorted(value));
}

class WorkspaceIdentity {
  const WorkspaceIdentity(this.tenantId, this.userId, this.workspaceId);
  final String tenantId, userId, workspaceId;
  String get encoded => canonicalJson([tenantId, userId, workspaceId]);
}

/// This is a local storage model, not an invented public sync DTO.
class CommandDraft {
  CommandDraft({
    required this.commandId,
    required this.aggregateType,
    required this.aggregateId,
    required this.commandType,
    required this.expectedVersion,
    required DateTime observedAt,
    required Map<String, Object?> payload,
    Map<String, Object?> provenance = const {},
    Map<String, Object?> projection = const {},
    List<String> attachmentIds = const [],
    this.commandVersion = 1,
  }) : observedAt = observedAt.toUtc(),
       payloadJson = canonicalJson(payload),
       provenanceJson = canonicalJson(provenance),
       projectionJson = canonicalJson(projection),
       attachmentIds = List.unmodifiable(attachmentIds.toList()..sort()) {
    if (!RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(commandId) ||
        [aggregateType, aggregateId, commandType].any((v) => v.isEmpty) ||
        (expectedVersion != null && expectedVersion! < 0) ||
        commandVersion < 1 ||
        attachmentIds.toSet().length != attachmentIds.length) {
      throw ArgumentError('Invalid provisional command');
    }
  }
  factory CommandDraft.create({
    required String aggregateType,
    required String aggregateId,
    required String commandType,
    required int? expectedVersion,
    required DateTime observedAt,
    required Map<String, Object?> payload,
    Map<String, Object?> provenance = const {},
    Map<String, Object?> projection = const {},
    List<String> attachmentIds = const [],
  }) => CommandDraft(
    commandId: const Uuid().v7(),
    aggregateType: aggregateType,
    aggregateId: aggregateId,
    commandType: commandType,
    expectedVersion: expectedVersion,
    observedAt: observedAt,
    payload: payload,
    provenance: provenance,
    projection: projection,
    attachmentIds: attachmentIds,
  );
  final String commandId, aggregateType, aggregateId, commandType;
  final int? expectedVersion;
  final int commandVersion;
  final DateTime observedAt;
  final String payloadJson, provenanceJson, projectionJson;
  final List<String> attachmentIds;
  String get ownerRef => '$aggregateType:$aggregateId';
  String get fingerprint => canonicalJson([
    commandId,
    aggregateType,
    aggregateId,
    commandType,
    expectedVersion,
    observedAt.toIso8601String(),
    payloadJson,
    provenanceJson,
    projectionJson,
    attachmentIds,
    commandVersion,
  ]);
}

class OfflineGrant {
  OfflineGrant({
    required this.id,
    required this.tenantId,
    required this.userId,
    required this.scopeVersion,
    required this.issuedAt,
    required this.expiresAt,
    required Set<String> allowedCommands,
    required Set<String> allowedOwners,
    required this.risk,
    required this.signedEnvelope,
  }) : allowedCommands = Set.unmodifiable(allowedCommands),
       allowedOwners = Set.unmodifiable(allowedOwners);
  final String id, tenantId, userId, risk, signedEnvelope;
  final int scopeVersion;
  final DateTime issuedAt, expiresAt;
  final Set<String> allowedCommands, allowedOwners;
  String get json => canonicalJson({
    'id': id,
    'tenant': tenantId,
    'user': userId,
    'scopeVersion': scopeVersion,
    'issuedAt': issuedAt.toUtc().toIso8601String(),
    'expiresAt': expiresAt.toUtc().toIso8601String(),
    'commands': allowedCommands.toList()..sort(),
    'owners': allowedOwners.toList()..sort(),
    'risk': risk,
    'signedEnvelope': signedEnvelope,
  });
}

/// Must authenticate the signature AND bind every parsed grant field to the signed
/// envelope using the authority's trusted key. WP49-020 supplies bootstrap wiring.
/// There is deliberately no permissive production implementation.
/// Owning domain adapter validates cached preconditions and O2 resource/quantity
/// limits. Storage never invents domain rules. Missing adapter denies enqueue.
typedef OfflineCommandValidator = Future<bool> Function(
  CommandDraft command,
  OfflineGrant grant,
);
Future<bool> denyOfflineCommand(
  CommandDraft command,
  OfflineGrant grant,
) async => false;

typedef OfflineGrantVerifier = Future<bool> Function(OfflineGrant grant);

class QueuedCommand {
  QueuedCommand(this.data);
  final Map<String, Object?> data;
  String get commandId => data['local_command_id'] as String;
  String get idempotencyKey => data['idempotency_key'] as String;
  int get deviceSeq => data['device_seq'] as int;
  int? get expectedVersion => data['expected_version'] as int?;
  DateTime get observedAt => DateTime.parse(data['observed_at'] as String);
  CommandState get state =>
      CommandState.values.byName(data['status'] as String);
  int get attempts => data['attempts'] as int;
  String? get leaseToken => data['lease_token'] as String?;
  QueueViewState get view => viewState(state);
}

class QueueCounts {
  const QueueCounts(this.pending, this.synced, this.conflict, this.failed);
  final int pending, synced, conflict, failed;
}
