import 'package:uuid/uuid.dart';

import 'database.dart';
import 'models.dart';

class CommandQueue {
  CommandQueue(
    this._db,
    this._identity,
    this._verify,
    this._validate,
    this._ensureOpen,
  );
  final LocalDatabase _db;
  final WorkspaceIdentity _identity;
  final OfflineGrantVerifier _verify;
  final OfflineCommandValidator _validate;
  final void Function() _ensureOpen;

  Future<QueuedCommand> enqueue(
    CommandDraft draft,
    OfflineGrant grant, {
    DateTime? now,
  }) async {
    _ensureOpen();
    final at = (now ?? DateTime.now()).toUtc();
    if (!await _verify(grant)) throw StateError('OFFLINE_PERMISSION_DENIED');
    return _db.write(() async {
      final workspace = (await _db.rows(
        'SELECT scope_version FROM local_workspace WHERE id=1',
      )).single;
      if (grant.id.isEmpty ||
          grant.signedEnvelope.isEmpty ||
          grant.tenantId != _identity.tenantId ||
          grant.userId != _identity.userId ||
          grant.scopeVersion != workspace['scope_version'] ||
          at.isBefore(grant.issuedAt) ||
          !at.isBefore(grant.expiresAt) ||
          !{'O1', 'O2'}.contains(grant.risk) ||
          !grant.allowedCommands.contains(draft.commandType) ||
          !grant.allowedOwners.contains(draft.ownerRef)) {
        throw StateError('OFFLINE_PERMISSION_DENIED');
      }
      final existing = await _db.rows(
        'SELECT * FROM sync_outbox WHERE local_command_id=?',
        [draft.commandId],
      );
      if (existing.isNotEmpty) {
        if (existing.single['fingerprint'] != draft.fingerprint) {
          throw StateError('IDEMPOTENCY_PAYLOAD_MISMATCH');
        }
        return QueuedCommand(existing.single);
      }
      if (!await _validate(draft, grant)) {
        throw StateError('LOCAL_PRECONDITION_FAILED');
      }
      final previousSnapshot = await _db.rows(
        'SELECT snapshot_json FROM permission_snapshot WHERE id=?',
        [grant.id],
      );
      if (previousSnapshot.isNotEmpty &&
          previousSnapshot.single['snapshot_json'] != grant.json) {
        throw StateError('PERMISSION_SNAPSHOT_MISMATCH');
      }
      await _db.customStatement(
        'INSERT OR IGNORE INTO permission_snapshot(id,snapshot_json) VALUES(?,?)',
        [grant.id, grant.json],
      );
      for (final id in draft.attachmentIds) {
        final attachments = await _db.rows(
          'SELECT owner_ref FROM local_attachment WHERE id=?',
          [id],
        );
        if (attachments.isEmpty ||
            attachments.single['owner_ref'] != draft.ownerRef) {
          throw StateError('ATTACHMENT_OWNER_MISMATCH');
        }
      }
      await _db.customStatement(
        'UPDATE local_device SET device_seq=device_seq+1 WHERE id=1',
      );
      final seq = (await _db.rows(
        'SELECT device_seq FROM local_device WHERE id=1',
      )).single['device_seq'];
      await _db.customStatement(
        '''INSERT INTO sync_outbox(local_command_id,idempotency_key,device_seq,
        aggregate_type,aggregate_id,expected_version,command_type,command_version,observed_at,created_at,
        payload_json,provenance_json,fingerprint,auth_snapshot_id,status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        [
          draft.commandId,
          draft.commandId,
          seq,
          draft.aggregateType,
          draft.aggregateId,
          draft.expectedVersion,
          draft.commandType,
          draft.commandVersion,
          draft.observedAt.toIso8601String(),
          at.toIso8601String(),
          draft.payloadJson,
          draft.provenanceJson,
          draft.fingerprint,
          grant.id,
          CommandState.pending.name,
        ],
      );
      await _db.customStatement(
        'INSERT INTO provisional_projection(command_id,owner_ref,projection_json) VALUES(?,?,?)',
        [draft.commandId, draft.ownerRef, draft.projectionJson],
      );
      for (final id in draft.attachmentIds) {
        await _db.customStatement(
          'INSERT INTO command_attachment(command_id,attachment_id) VALUES(?,?)',
          [draft.commandId, id],
        );
      }
      await _audit(draft.commandId, 'PROVISIONAL_CREATED', at);
      return (await get(draft.commandId))!;
    });
  }

  Future<QueuedCommand?> get(String id) async {
    _ensureOpen();
    final rows = await _db.rows(
      'SELECT * FROM sync_outbox WHERE local_command_id=?',
      [id],
    );
    return rows.isEmpty ? null : QueuedCommand(rows.single);
  }

  Future<int> count() async {
    _ensureOpen();
    return (await _db.rows('SELECT count(*) AS n FROM sync_outbox')).single['n']
        as int;
  }

  Future<QueueCounts> counts() async {
    _ensureOpen();
    final values = <QueueViewState, int>{};
    for (final row in await _db.rows(
      'SELECT status,count(*) AS n FROM sync_outbox GROUP BY status',
    )) {
      final view = viewState(
        CommandState.values.byName(row['status'] as String),
      );
      values[view] = (values[view] ?? 0) + (row['n'] as int);
    }
    return QueueCounts(
      values[QueueViewState.pending] ?? 0,
      values[QueueViewState.synced] ?? 0,
      values[QueueViewState.conflict] ?? 0,
      values[QueueViewState.failed] ?? 0,
    );
  }

  /// Persisted leases prevent concurrent dispatchers from claiming one command.
  /// Expired leases recover the SAME ID after crash, never a replacement command.
  Future<QueuedCommand?> claim({
    DateTime? now,
    Set<String> batchCommandIds = const {},
    Duration lease = const Duration(minutes: 2),
  }) async {
    _ensureOpen();
    if (lease <= Duration.zero) throw ArgumentError('Positive lease required');
    final at = (now ?? DateTime.now()).toUtc();
    return _db.write(() async {
      final candidates = await _db.rows(
        "SELECT * FROM sync_outbox INDEXED BY outbox_delivery_order WHERE status IN ('pending','retryWait','sending') AND local_command_id NOT IN (${batchCommandIds.isEmpty ? "''" : List.filled(batchCommandIds.length, '?').join(',')}) ORDER BY device_seq LIMIT 1",
        [...batchCommandIds],
      );
      if (candidates.isEmpty) return null;
      final candidate = candidates.single;
      final ready = candidate['status'] == 'sending'
          ? (candidate['lease_until'] as int) <= at.millisecondsSinceEpoch
          : (candidate['next_retry_at'] as int) <= at.millisecondsSinceEpoch;
      if (!ready) return null;
      final blocked = await _db.rows(
        "SELECT 1 FROM command_attachment c JOIN local_attachment a ON a.id=c.attachment_id WHERE c.command_id=? AND a.required_evidence=1 AND a.upload_state!='confirmed' LIMIT 1",
        [candidate['local_command_id']],
      );
      if (blocked.isNotEmpty) return null;
      final id = candidates.single['local_command_id'] as String;
      await _db.customStatement(
        "UPDATE sync_outbox SET status='sending',attempts=attempts+1,lease_token=?,lease_until=? WHERE local_command_id=?",
        [const Uuid().v7(), at.add(lease).millisecondsSinceEpoch, id],
      );
      return get(id);
    });
  }

  Future<void> retry(
    String id,
    String leaseToken, {
    required DateTime nextRetryAt,
    String errorCode = 'RETRYABLE',
  }) async {
    _ensureOpen();
    _safeCode(errorCode);
    await _db.write(() async {
      await _requireLease(id, leaseToken);
      await _db.customStatement(
        "UPDATE sync_outbox SET status='retryWait',next_retry_at=?,lease_token=NULL,lease_until=NULL,error_code=? WHERE local_command_id=?",
        [nextRetryAt.toUtc().millisecondsSinceEpoch, errorCode, id],
      );
    });
  }

  /// Only a server-result adapter may call this. No local validation can confirm
  /// canonical facts. Receipt and state/audit are committed atomically.
  Future<void> recordServerResult(
    String id,
    String leaseToken, {
    required CommandState state,
    required Map<String, Object?> result,
    required DateTime serverReceivedAt,
    int? canonicalVersion,
  }) async {
    _ensureOpen();
    if (!{
      CommandState.confirmed,
      CommandState.conflict,
      CommandState.rejected,
      CommandState.actionRequired,
    }.contains(state)) {
      throw ArgumentError('Terminal server result required');
    }
    if (canonicalVersion != null && canonicalVersion < 0) {
      throw ArgumentError('Invalid canonical version');
    }
    final json = canonicalJson(result);
    final received = serverReceivedAt.toUtc().toIso8601String();
    await _db.write(() async {
      final prior = await _db.rows(
        'SELECT * FROM sync_command_result WHERE local_command_id=?',
        [id],
      );
      if (prior.isNotEmpty) {
        final value = prior.single;
        if (value['result_status'] != state.name ||
            value['result_json'] != json ||
            value['server_received_at'] != received ||
            value['canonical_version'] != canonicalVersion) {
          throw StateError('SERVER_RESULT_MISMATCH');
        }
        return;
      }
      await _requireLease(id, leaseToken);
      await _db.customStatement(
        'INSERT INTO sync_command_result VALUES(?,?,?,?,?)',
        [id, state.name, canonicalVersion, json, received],
      );
      await _db.customStatement(
        'UPDATE sync_outbox SET status=?,lease_token=NULL,lease_until=NULL,error_code=NULL WHERE local_command_id=?',
        [state.name, id],
      );
      await _audit(id, 'SERVER_${state.name.toUpperCase()}', serverReceivedAt);
    });
  }

  Future<void> connectivityRestored() async {
    _ensureOpen();
    await _db.customStatement(
      "UPDATE sync_outbox SET next_retry_at=0 WHERE status='retryWait'",
    );
  }

  Future<void> _requireLease(String id, String token) async {
    final value = await get(id);
    if (value == null ||
        value.state != CommandState.sending ||
        token.isEmpty ||
        value.leaseToken != token) {
      throw StateError('STALE_COMMAND_LEASE');
    }
  }

  Future<void> _audit(String id, String event, DateTime at) =>
      _db.customStatement(
        'INSERT INTO local_audit(command_id,event,at) VALUES(?,?,?)',
        [id, event, at.toUtc().toIso8601String()],
      );
  void _safeCode(String code) {
    if (!RegExp(r'^[A-Z][A-Z0-9_]{0,63}$').hasMatch(code)) {
      throw ArgumentError('Normalized error code required');
    }
  }
}
