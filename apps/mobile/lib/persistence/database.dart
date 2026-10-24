import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';

/// Schema v1 is the first mobile DB. The bootstrap shell had no persisted schema.
/// Custom SQL remains behind Drift transactions; no server tables are replicated.
class LocalDatabase extends GeneratedDatabase {
  LocalDatabase(super.executor);

  static QueryExecutor encrypted(File file, String key) {
    if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(key)) {
      throw ArgumentError('Invalid workspace key');
    }
    return NativeDatabase.createInBackground(
      file,
      setup: (raw) {
        // Never silently fall back to plaintext SQLite, including release builds.
        if (raw.select('PRAGMA cipher').isEmpty) {
          throw StateError('Encrypted SQLite required');
        }
        raw.execute("PRAGMA key = '$key'");
        raw.select(
          'SELECT count(*) FROM sqlite_master',
        ); // wrong key fails before migration
        raw.execute('PRAGMA journal_mode = WAL');
        raw.execute('PRAGMA foreign_keys = ON');
        raw.execute('PRAGMA busy_timeout = 5000');
        raw.execute('PRAGMA synchronous = FULL');
      },
    );
  }

  @override
  int get schemaVersion => 1;
  @override
  Iterable<TableInfo<Table, Object?>> get allTables => const [];
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => const [];
  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (_) async {
      for (final statement in schemaV1) {
        await customStatement(statement);
      }
    },
    onUpgrade: (_, from, to) async =>
        throw StateError('Unsupported local schema migration $from -> $to'),
    beforeOpen: (details) async {
      if (details.versionBefore != null &&
          details.versionBefore! > schemaVersion) {
        throw StateError('APP_UPDATE_REQUIRED');
      }
      final check = await customSelect('PRAGMA quick_check').getSingle();
      if (check.data.values.single != 'ok') {
        throw StateError('LOCAL_DATABASE_CORRUPT');
      }
    },
  );

  Future<List<Map<String, Object?>>> rows(
    String sql, [
    List<Object?> args = const [],
  ]) async => (await customSelect(
    sql,
    variables: args.map((v) => Variable(v)).toList(),
  ).get()).map((row) => Map<String, Object?>.unmodifiable(row.data)).toList();

  Future<T> write<T>(Future<T> Function() action) => transaction(() async {
    // Acquire the writer lock before any read to avoid deferred transaction
    // upgrade races between multiple database connections.
    await customStatement(
      'UPDATE local_device SET device_seq=device_seq WHERE id=1',
    );
    return action();
  });

  static const schemaV1 = [
    '''CREATE TABLE local_workspace (
      id INTEGER PRIMARY KEY CHECK(id=1), tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL, authority_mode TEXT NOT NULL CHECK(authority_mode='LOCAL_PRIMARY'),
      api_base TEXT, schema_version INTEGER NOT NULL DEFAULT 1, scope_version INTEGER NOT NULL DEFAULT 1,
      last_bootstrap_at TEXT)''',
    '''CREATE TABLE local_device (id INTEGER PRIMARY KEY CHECK(id=1), device_id TEXT NOT NULL,
      installation_id TEXT NOT NULL, app_version TEXT NOT NULL DEFAULT '0.0.0+1',
      platform TEXT NOT NULL DEFAULT 'unknown', registered_at TEXT, trust_mode TEXT NOT NULL DEFAULT 'UNREGISTERED',
      device_seq INTEGER NOT NULL DEFAULT 0 CHECK(device_seq>=0))''',
    '''CREATE TABLE permission_snapshot (id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL)''',
    '''CREATE TABLE sync_outbox (
      local_command_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
      device_seq INTEGER NOT NULL UNIQUE, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
      expected_version INTEGER, command_type TEXT NOT NULL, command_version INTEGER NOT NULL,
      sync_schema_version INTEGER NOT NULL DEFAULT 1, observed_at TEXT NOT NULL, created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL, provenance_json TEXT NOT NULL, fingerprint TEXT NOT NULL,
      auth_snapshot_id TEXT NOT NULL REFERENCES permission_snapshot(id),
      status TEXT NOT NULL CHECK(status IN ('pending','sending','retryWait','confirmed','conflict','rejected','actionRequired')),
      attempts INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER NOT NULL DEFAULT 0,
      lease_token TEXT, lease_until INTEGER, error_code TEXT,
      CHECK(local_command_id=idempotency_key))''',
    'CREATE INDEX outbox_ready ON sync_outbox(status,next_retry_at,device_seq)',
    '''CREATE TABLE provisional_projection (command_id TEXT PRIMARY KEY REFERENCES sync_outbox(local_command_id),
      owner_ref TEXT NOT NULL, projection_json TEXT NOT NULL)''',
    '''CREATE TABLE sync_command_result (local_command_id TEXT PRIMARY KEY REFERENCES sync_outbox(local_command_id),
      result_status TEXT NOT NULL, canonical_version INTEGER, result_json TEXT NOT NULL,
      server_received_at TEXT NOT NULL)''',
    '''CREATE TABLE local_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, command_id TEXT NOT NULL
      REFERENCES sync_outbox(local_command_id), event TEXT NOT NULL, at TEXT NOT NULL)''',
    '''CREATE TABLE local_attachment (id TEXT PRIMARY KEY, owner_ref TEXT NOT NULL, evidence_type TEXT NOT NULL,
      path TEXT NOT NULL, sha256 TEXT NOT NULL, mime TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
      required_evidence INTEGER NOT NULL, wifi_only INTEGER NOT NULL, upload_state TEXT NOT NULL DEFAULT 'pending'
      CHECK(upload_state IN ('pending','uploading','failed','confirmed')),
      remote_id TEXT, upload_session TEXT, error_code TEXT, created_at TEXT NOT NULL)''',
    '''CREATE TABLE attachment_part (attachment_id TEXT NOT NULL REFERENCES local_attachment(id),
      part_no INTEGER NOT NULL CHECK(part_no>=1), offset_bytes INTEGER NOT NULL CHECK(offset_bytes>=0),
      size_bytes INTEGER NOT NULL CHECK(size_bytes>0), checksum TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed')),
      PRIMARY KEY(attachment_id,part_no))''',
    '''CREATE TABLE command_attachment (command_id TEXT NOT NULL REFERENCES sync_outbox(local_command_id),
      attachment_id TEXT NOT NULL REFERENCES local_attachment(id), PRIMARY KEY(command_id,attachment_id))''',
  ];
}
