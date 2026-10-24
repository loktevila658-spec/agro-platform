import 'dart:convert';
import 'dart:math';

import '../persistence/command_queue.dart';
import '../persistence/models.dart';
import '../persistence/workspace.dart';
import 'attachment_worker.dart';
import 'pull_store.dart';
import 'protocol.dart';
import 'grant_verifier.dart';

class SyncEngine {
  SyncEngine(
    this.workspace,
    this.queue,
    this.transport, {
    DateTime Function()? clock,
    double Function()? jitter,
    this.grantVerifier,
  }) : clock = clock ?? DateTime.now,
       jitter = jitter ?? Random().nextDouble,
       store = PullStore(workspace.db);
  final Workspace workspace;
  final CommandQueue queue;
  final SyncTransport transport;
  final DateTime Function() clock;
  final double Function() jitter;
  final PullStore store;
  final AuthorityGrantVerifier? grantVerifier;
  bool _running = false;
  static const retrySeconds = [5, 15, 45, 120, 300, 900, 1800];
  Duration backoff(int attempt, {Duration? retryAfter}) {
    final base = retrySeconds[(attempt - 1).clamp(0, retrySeconds.length - 1)];
    final wait = Duration(
      milliseconds: (base * 1000 * (0.8 + 0.4 * jitter().clamp(0, 1)))
          .round()
          .clamp(0, 1800000),
    );
    return retryAfter != null && retryAfter > wait ? retryAfter : wait;
  }

  Future<void> run({
    bool connectivityRestored = false,
    int maxBatches = 1,
    int maxPullPages = 100,
  }) async {
    workspace.ensureOpen();
    if (_running) return;
    _running = true;
    try {
      if (connectivityRestored) await queue.connectivityRestored();
      final device = (await workspace.db.rows(
        'SELECT * FROM local_device WHERE id=1',
      )).single;
      final deviceId = device['device_id'] as String;
      if (await store.cursor() == null) {
        final registered = await transport.register(
          SyncRegisterRequest(
            deviceId: deviceId,
            installationId: device['installation_id'] as String,
            schemaVersion: 1,
          ),
        );
        if (registered.deviceId != deviceId ||
            registered.authorityMode != 'LOCAL_PRIMARY') {
          throw StateError('AUTHORITY_MODE_MISMATCH');
        }
        await _bootstrap(
          await transport.bootstrap(
            SyncBootstrapRequest(deviceId: deviceId, schemaVersion: 1),
          ),
        );
      }
      final scope =
          (await workspace.db.rows(
                'SELECT scope_version FROM local_workspace WHERE id=1',
              )).single['scope_version']
              as int;
      for (var batch = 0; batch < maxBatches; batch++) {
        final leases = <QueuedCommand>[];
        final commands = <SyncCommand>[];
        for (var index = 0; index < 50; index++) {
          final lease = await queue.claim(
            now: clock(),
            batchCommandIds: leases.map((c) => c.commandId).toSet(),
          );
          if (lease == null) break;
          final envelope = await _envelope(lease);
          final probe = SyncPushRequest(
            deviceId: deviceId,
            scopeVersion: scope,
            schemaVersion: 1,
            commands: [...commands, envelope],
          );
          if (utf8.encode(jsonEncode(probe.toJson())).length > 1048576) {
            await queue.retry(
              lease.commandId,
              lease.leaseToken!,
              nextRetryAt: clock(),
              errorCode: 'SYNC_BATCH_LIMIT',
            );
            break;
          }
          leases.add(lease);
          commands.add(envelope);
        }
        if (leases.isEmpty) break;
        final remaining = {for (final lease in leases) lease.commandId: lease};
        try {
          final response = await transport.push(
            SyncPushRequest(
              deviceId: deviceId,
              scopeVersion: scope,
              schemaVersion: 1,
              commands: commands,
            ),
          );
          final seen = <String>{};
          for (final result in response.results) {
            final lease = remaining[result.localCommandId];
            if (lease == null || !seen.add(result.localCommandId)) {
              throw const SyncFailure('INVALID_SERVER_RESULT');
            }
            final state = switch (result.status) {
              'ACCEPTED' => CommandState.confirmed,
              'CONFLICT' => CommandState.conflict,
              'REJECTED' => CommandState.rejected,
              'ACTION_REQUIRED' => CommandState.actionRequired,
              _ => throw const SyncFailure('INVALID_SERVER_RESULT'),
            };
            await queue.recordServerResult(
              lease.commandId,
              lease.leaseToken!,
              state: state,
              result: jsonDecode(
                jsonEncode(result.toJson()),
              ) as Map<String, dynamic>,
              serverReceivedAt: DateTime.parse(result.receivedAt),
              canonicalVersion: result.aggregateVersion,
            );
            remaining.remove(lease.commandId);
          }
        } on SyncFailure catch (error) {
          // HTTP auth/scope/schema failures are request-level, never fabricate a
          // domain receipt. Preserve original intent and retry after intervention.
          for (final lease in remaining.values) {
            await queue.retry(
              lease.commandId,
              lease.leaseToken!,
              nextRetryAt: clock().add(
                error.retryable
                    ? backoff(lease.attempts, retryAfter: error.retryAfter)
                    : const Duration(minutes: 30),
              ),
              errorCode: error.code,
            );
          }
          if (error.code == 'SCOPE_VERSION_MISMATCH') {
            await _bootstrap(
              await transport.bootstrap(
                SyncBootstrapRequest(deviceId: deviceId, schemaVersion: 1),
              ),
            );
            return;
          }
          if (!error.retryable) rethrow;
          break;
        } catch (_) {
          for (final lease in remaining.values) {
            await queue.retry(
              lease.commandId,
              lease.leaseToken!,
              nextRetryAt: clock().add(backoff(lease.attempts)),
            );
          }
          break;
        }
        for (final lease in remaining.values) {
          await queue.retry(
            lease.commandId,
            lease.leaseToken!,
            nextRetryAt: clock().add(backoff(lease.attempts)),
            errorCode: 'PARTIAL_BATCH',
          );
        }
        if (remaining.isNotEmpty) break;
      }
      for (var page = 0; page < maxPullPages; page++) {
        final cursor = (await store.cursor())!;
        // Retrying ACK after restart is safe; it never precedes local commit.
        await transport.ack(
          SyncAckRequest(
            deviceId: deviceId,
            scopeVersion: scope,
            cursor: cursor,
          ),
        );
        final response = await transport.pull(
          SyncPullRequest(
            deviceId: deviceId,
            scopeVersion: scope,
            cursor: cursor,
            limit: 500,
          ),
        );
        if (response.resetRequired) {
          await _bootstrap(
            await transport.bootstrap(
              SyncBootstrapRequest(deviceId: deviceId, schemaVersion: 1),
            ),
          );
          return; // next run uses newly persisted scope; queue never cleared
        }
        await store.apply(cursor, response);
        await transport.ack(
          SyncAckRequest(
            deviceId: deviceId,
            scopeVersion: scope,
            cursor: response.nextCursor,
          ),
        );
        if (!response.hasMore) break;
      }
    } finally {
      _running = false;
    }
  }

  Future<void> _bootstrap(SyncBootstrapResponse manifest) async {
    final verifier = grantVerifier;
    if (manifest.grants.isNotEmpty && verifier == null) {
      throw StateError('AUTHORITY_KEY_REQUIRED');
    }
    final grants = manifest.grants.map((g) => verifier!.parse(g)).toList();
    for (final grant in grants) {
      if (!await verifier!.verify(grant)) {
        throw StateError('OFFLINE_PERMISSION_DENIED');
      }
    }
    await workspace.db.write(() async {
      await store.bootstrap(manifest);
      for (final grant in grants) {
        final prior = await workspace.db.rows(
          'SELECT snapshot_json FROM permission_snapshot WHERE id=?',
          [grant.id],
        );
        if (prior.isNotEmpty && prior.single['snapshot_json'] != grant.json) {
          throw StateError('PERMISSION_SNAPSHOT_MISMATCH');
        }
        await workspace.db.customStatement(
          'INSERT OR IGNORE INTO permission_snapshot VALUES(?,?)',
          [grant.id, grant.json],
        );
      }
    });
  }

  Future<SyncCommand> _envelope(QueuedCommand lease) async {
    final row = lease.data;
    final refs = await workspace.db.rows(
      'SELECT a.* FROM command_attachment c JOIN local_attachment a ON a.id=c.attachment_id WHERE c.command_id=? ORDER BY a.id',
      [lease.commandId],
    );
    return SyncCommand(
      localCommandId: lease.commandId,
      idempotencyKey: lease.idempotencyKey,
      deviceSeq: lease.deviceSeq,
      aggregate: SyncAggregate(
        type: row['aggregate_type'] as String,
        id: row['aggregate_id'] as String,
      ),
      baseVersion: lease.expectedVersion,
      type: row['command_type'] as String,
      commandVersion: row['command_version'] as int,
      observedAt: row['observed_at'] as String,
      offlineAuthId: row['auth_snapshot_id'] as String,
      payload:
          jsonDecode(row['payload_json'] as String) as Map<String, dynamic>,
      provenance:
          jsonDecode(row['provenance_json'] as String) as Map<String, dynamic>,
      attachments: refs.map(attachmentIntent).toList(),
    );
  }
}
