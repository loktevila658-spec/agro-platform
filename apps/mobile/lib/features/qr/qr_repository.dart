import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../../persistence.dart';
import '../../sync/protocol.dart';
import 'qr_payload.dart';

typedef QrRequest = Future<Map<String, Object?>> Function(
  String path,
  Map<String, Object?> body,
  Map<String, String> headers,
);

class QrView {
  const QrView(
    this.identity,
    this.status, {
    this.name,
    this.code,
    this.cached = false,
  });
  final QrIdentity identity;
  final String status;
  final String? name, code;
  final bool cached;
}

class QrRepository {
  QrRepository(this.workspace, this.request);
  final Workspace workspace;
  final QrRequest request;
  bool _closed = false;
  bool _retrying = false;
  void close() {
    _closed = true;
  }

  Future<int> _scope() async {
    if (_closed) {
      throw StateError('QR_WORKSPACE_CLOSED');
    }
    return (await workspace.db.rows(
          'SELECT scope_version FROM local_workspace WHERE id=1',
        )).single['scope_version']
        as int;
  }

  Future<String> _stamp() async => jsonEncode([
    await _scope(),
    await workspace.db.rows(
      'SELECT cursor,last_seq,scope_version FROM sync_cursor ORDER BY stream',
    ),
  ]);
  Future<QrView> resolve(String raw, {bool refresh = false}) async {
    final ref = QrIdentity.decode(raw), scope = await _scope();
    final stamp = await _stamp();
    final denied = (await workspace.db.rows(
      "SELECT entity_id FROM qr_unresolved WHERE state='DENIED' LIMIT 1",
    )).isNotEmpty;
    if (!refresh && !denied) {
      final cached = await workspace.db.rows(
        'SELECT projection_json FROM qr_cache WHERE entity_id=? AND scope_version=?',
        [ref.entityId, scope],
      );
      if (cached.isNotEmpty && await _stamp() == stamp) {
        final projection = jsonDecode(
          cached.single['projection_json'] as String,
        ) as Map<String, dynamic>;
        return QrView(
          ref,
          'RESOLVED',
          name: projection['name'] as String?,
          code: projection['code'] as String?,
          cached: true,
        );
      }
      final synced = await workspace.db.rows(
        "SELECT projection_json FROM entity_cache WHERE entity_type='Material' AND entity_id=?",
        [ref.entityId],
      );
      if (synced.isNotEmpty && await _stamp() == stamp) {
        final projection = jsonDecode(
          synced.single['projection_json'] as String,
        ) as Map<String, dynamic>;
        if (projection['active'] == true &&
            projection['name'] is String &&
            projection['code'] is String) {
          return QrView(
            ref,
            'RESOLVED',
            name: projection['name'] as String,
            code: projection['code'] as String,
            cached: true,
          );
        }
      }
    }
    await workspace.db.write(() async {
      if (await _scope() != scope || await _stamp() != stamp) {
        throw StateError('QR_SCOPE_CHANGED');
      }
      await workspace.db.customStatement(
        "INSERT INTO qr_unresolved(entity_id,payload,state) VALUES(?,?,'PENDING') ON CONFLICT(entity_id) DO UPDATE SET state=CASE WHEN qr_unresolved.state='DENIED' THEN 'DENIED' ELSE 'PENDING' END",
        [ref.entityId, ref.payload],
      );
    });
    try {
      final result = await request('/v1/qr/resolve', {
        'payload': ref.payload,
      }, const {});
      if (result['version'] != 1 ||
          result['entityType'] != 'Material' ||
          result['entityId'] != ref.entityId ||
          !{'RESOLVED', 'UNAVAILABLE'}.contains(result['status']) ||
          (result['status'] == 'RESOLVED' &&
              (result['active'] != true ||
                  result['name'] is! String ||
                  result['code'] is! String))) {
        throw StateError('QR_INVALID_RESPONSE');
      }
      await workspace.db.write(() async {
        if (await _scope() != scope || await _stamp() != stamp) {
          throw StateError('QR_SCOPE_CHANGED');
        }
        await workspace.db.customStatement(
          'DELETE FROM qr_cache WHERE entity_id=?',
          [ref.entityId],
        );
        if (result['status'] == 'RESOLVED') {
          await workspace.db.customStatement(
            'INSERT INTO qr_cache VALUES(?,?,?)',
            [
              ref.entityId,
              scope,
              jsonEncode({'name': result['name'], 'code': result['code']}),
            ],
          );
          await workspace.db.customStatement(
            'DELETE FROM qr_unresolved WHERE entity_id=?',
            [ref.entityId],
          );
        } else {
          await workspace.db.customStatement(
            "UPDATE qr_unresolved SET state='UNAVAILABLE' WHERE entity_id=?",
            [ref.entityId],
          );
        }
      });
      return QrView(
        ref,
        result['status'] as String,
        name: result['name'] as String?,
        code: result['code'] as String?,
      );
    } on SyncFailure catch (error) {
      if (_closed) {
        rethrow;
      }
      if (error.status == 401 || error.status == 403) {
        await workspace.db.write(() async {
          await workspace.db.customStatement('DELETE FROM qr_cache');
          await workspace.db.customStatement(
            "UPDATE qr_unresolved SET state='DENIED' WHERE entity_id=?",
            [ref.entityId],
          );
        });
        return QrView(ref, 'DENIED');
      }
      if (error.status != null && error.status! < 500 && error.status != 429) {
        rethrow;
      }
      return QrView(ref, denied ? 'DENIED' : 'PENDING');
    }
  }

  Future<String> create(String id) async {
    final ref = QrIdentity(id);
    await _scope();
    final key = await workspace.db.write(() async {
      await _scope();
      await workspace.db.customStatement(
        'INSERT OR IGNORE INTO qr_issue VALUES(?,?)',
        [id, const Uuid().v7()],
      );
      return (await workspace.db.rows(
            'SELECT request_key FROM qr_issue WHERE entity_id=?',
            [id],
          )).single['request_key']
          as String;
    });
    final result = await request(
      '/v1/qr-codes',
      {'entityType': 'Material', 'entityId': id},
      {'Idempotency-Key': key},
    );
    if (result['version'] != 1 ||
        result['payload'] is! String ||
        QrIdentity.decode(result['payload'] as String).entityId != id) {
      throw StateError('QR_INVALID_RESPONSE');
    }
    await _scope();
    return ref.payload;
  }

  // Offline-created UUIDv7 may be encoded before server sync. This creates only
  // a label, never a canonical entity or a claim of server-issued evidence.
  String encodeLocal(String id) => QrIdentity(id).payload;
  Future<void> retry() async {
    if (_closed || _retrying) {
      return;
    }
    _retrying = true;
    try {
      final rows = await workspace.db.rows(
        "SELECT payload FROM qr_unresolved WHERE state='PENDING' ORDER BY entity_id LIMIT 50",
      );
      for (final row in rows) {
        if (_closed) {
          return;
        }
        await resolve(row['payload'] as String, refresh: true);
      }
    } finally {
      _retrying = false;
    }
  }
}
