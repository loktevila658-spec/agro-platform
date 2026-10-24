import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart' show sha256;
import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import 'database.dart';
import 'models.dart';
import 'command_queue.dart';
import 'attachment_queue.dart';

abstract interface class SecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class OsSecretStore implements SecretStore {
  const OsSecretStore();
  static const _storage = FlutterSecureStorage();
  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

class Workspace {
  Workspace._(
    this.identity,
    this.directory,
    this.db,
    this._secrets,
    this._keyName,
    this._attachmentKey,
  );
  final WorkspaceIdentity identity;
  final Directory directory;
  final LocalDatabase db;
  final SecretStore _secrets;
  final String _keyName;
  final SecretKey _attachmentKey;
  bool _closed = false;

  static final Map<String, Future<void>> _opening = {};

  static Future<Workspace> open(
    WorkspaceIdentity identity, {
    Directory? root,
    SecretStore secrets = const OsSecretStore(),
    String? authenticatedDeviceId,
    Uri? authorityUri,
  }) async {
    final name = '${root?.absolute.path ?? "app-private"}:${identity.encoded}';
    final previous = _opening[name] ?? Future<void>.value();
    final release = Completer<void>();
    _opening[name] = release.future;
    await previous;
    try {
      return await _open(
        identity,
        root: root,
        secrets: secrets,
        authenticatedDeviceId: authenticatedDeviceId,
        authorityUri: authorityUri,
      );
    } finally {
      release.complete();
      if (identical(_opening[name], release.future)) _opening.remove(name);
    }
  }

  static Future<Workspace> _open(
    WorkspaceIdentity identity, {
    Directory? root,
    SecretStore secrets = const OsSecretStore(),
    String? authenticatedDeviceId,
    Uri? authorityUri,
  }) async {
    if ([
      identity.tenantId,
      identity.userId,
      identity.workspaceId,
    ].any((v) => v.isEmpty)) {
      throw ArgumentError('Workspace identity required');
    }
    root ??= Directory(
      p.join((await getApplicationSupportDirectory()).path, 'workspaces'),
    );
    await root.create(recursive: true);
    final name = sha256.convert(utf8.encode(identity.encoded)).toString();
    final directory = Directory(p.join(root.path, name));
    await directory.create();
    // Serializes first key creation/open across isolates/processes. A lock file is
    // not business authority; SQLite remains the sole durable local intent store.
    final lock = await File(p.join(directory.path, '.open.lock'))
        .open(mode: FileMode.append);
    await lock.lock(FileLock.blockingExclusive);
    try {
      final file = File(p.join(directory.path, 'workspace.db'));
      final keyName = 'agro.workspace.$name';
      var key = await secrets.read(keyName);
      if (key == null) {
        if (await file.exists()) {
          throw StateError('WORKSPACE_LOCKED_KEY_MISSING');
        }
        final random = Random.secure();
        key = List.generate(
          32,
          (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
        ).join();
        await secrets.write(keyName, key);
      }
      final db = LocalDatabase(LocalDatabase.encrypted(file, key));
      try {
        await db.transaction(() async {
          await db.customStatement(
            'INSERT OR IGNORE INTO local_workspace(id,tenant_id,user_id,workspace_id,authority_mode,api_base) VALUES(1,?,?,?,?,?)',
            [
              identity.tenantId,
              identity.userId,
              identity.workspaceId,
              'LOCAL_PRIMARY',
              authorityUri?.toString(),
            ],
          );
          await db.customStatement(
            'UPDATE local_workspace SET schema_version=2 WHERE id=1',
          );
          final stored = (await db.rows('SELECT * FROM local_workspace'))
              .single;
          if (stored['tenant_id'] != identity.tenantId ||
              stored['user_id'] != identity.userId ||
              stored['workspace_id'] != identity.workspaceId ||
              (authorityUri != null &&
                  stored['api_base'] != authorityUri.toString())) {
            throw StateError('WORKSPACE_IDENTITY_MISMATCH');
          }
          // Registration may bind this workspace installation to server identity
          // in WP49-020. Opening never changes identity or resets device_seq.
          await db.customStatement(
            'INSERT OR IGNORE INTO local_device(id,device_id,installation_id,platform) VALUES(1,?,?,?)',
            [
              authenticatedDeviceId ?? const Uuid().v7(),
              const Uuid().v7(),
              Platform.operatingSystem,
            ],
          );
          if (authenticatedDeviceId != null &&
              (await db.rows('SELECT device_id FROM local_device WHERE id=1'))
                      .single['device_id'] !=
                  authenticatedDeviceId) {
            throw StateError('WORKSPACE_DEVICE_MISMATCH');
          }
        });
      } catch (_) {
        await db.close();
        rethrow;
      }
      final attachmentKey = await Hkdf(hmac: Hmac.sha256(), outputLength: 32)
          .deriveKey(
            secretKey: SecretKey(utf8.encode(key)),
            nonce: utf8.encode(name),
            info: utf8.encode('agro.attachments.v1'),
          );
      return Workspace._(
        identity,
        directory,
        db,
        secrets,
        keyName,
        attachmentKey,
      );
    } finally {
      await lock.unlock();
      await lock.close();
    }
  }

  CommandQueue commands({
    required OfflineGrantVerifier verify,
    OfflineCommandValidator validate = denyOfflineCommand,
  }) {
    ensureOpen();
    return CommandQueue(db, identity, verify, validate, ensureOpen);
  }

  AttachmentQueue get attachments {
    ensureOpen();
    return AttachmentQueue(db, directory, _attachmentKey, ensureOpen);
  }

  void ensureOpen() {
    if (_closed) throw StateError('WORKSPACE_LOCKED');
  }

  Future<void> close() async {
    if (!_closed) {
      _closed = true;
      await db.close();
    }
  }

  /// Call only for an explicit SHARED logout/purge policy. Failure must prevent
  /// opening a different user's workspace. PERSONAL logout just closes the DB.
  Future<void> wipeShared() async {
    await close();
    await _wipeDirectory(directory, _secrets, _keyName);
  }

  /// Allows SHARED logout to clean a workspace which failed to open (for
  /// example a missing key/corrupt database), without attempting to rekey it.
  static Future<void> wipeSharedIdentity(
    WorkspaceIdentity identity, {
    Directory? root,
    SecretStore secrets = const OsSecretStore(),
  }) async {
    root ??= Directory(
      p.join((await getApplicationSupportDirectory()).path, 'workspaces'),
    );
    final name = sha256.convert(utf8.encode(identity.encoded)).toString();
    await _wipeDirectory(
      Directory(p.join(root.path, name)),
      secrets,
      'agro.workspace.$name',
    );
  }

  static Future<void> _wipeDirectory(
    Directory directory,
    SecretStore secrets,
    String keyName,
  ) async {
    await secrets.delete(keyName);
    if (await secrets.read(keyName) != null) {
      throw StateError('WORKSPACE_WIPE_FAILED');
    }
    if (await directory.exists()) await directory.delete(recursive: true);
  }
}
