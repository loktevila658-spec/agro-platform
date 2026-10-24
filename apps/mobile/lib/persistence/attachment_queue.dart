import 'dart:convert';
import 'dart:io';
import 'dart:math' show min;
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import 'database.dart';

const attachmentPartBytes = 5 * 1024 * 1024;
const acceptedAttachmentMimes = {
  'image/jpeg',
  'image/png',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
};

class _DigestSink implements Sink<Digest> {
  Digest? value;
  @override
  void add(Digest data) {
    value = data;
  }

  @override
  void close() {}
}

/// Files are encrypted before metadata/command references can become visible.
/// Unreferenced staging directories after process death are harmless orphans;
/// they must never be mistaken for committed queue entries or auto-replayed.
class AttachmentQueue {
  AttachmentQueue(this._db, this._workspace, this._key, this._ensureOpen);
  final LocalDatabase _db;
  final Directory _workspace;
  final SecretKey _key;
  final void Function() _ensureOpen;

  Future<String> stage(
    File source, {
    required String ownerRef,
    required String evidenceType,
    required String mime,
    bool requiredEvidence = false,
    bool wifiOnly = false,
    int maxBytes = 2 * 1024 * 1024 * 1024,
    String? attachmentId,
  }) async {
    _ensureOpen();
    final id = attachmentId ?? const Uuid().v7();
    if (!RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(id) ||
        ownerRef.isEmpty ||
        evidenceType.isEmpty ||
        !acceptedAttachmentMimes.contains(mime) ||
        maxBytes <= 0) {
      throw ArgumentError('Invalid attachment metadata');
    }
    final length = await source.length();
    if (length <= 0 || length > maxBytes) {
      throw StateError('ATTACHMENT_SIZE_LIMIT');
    }
    final stagingName = const Uuid().v7();
    final directory = Directory(
      p.join(_workspace.path, 'attachments', stagingName),
    );
    await directory.create(recursive: true);
    var committed = false;
    try {
      final staged = await compute(_stageFile, (
        source: source.path,
        directory: directory.path,
        id: id,
        owner: ownerRef,
        mime: mime,
        length: length,
        key: await _key.extractBytes(),
      ));
      final parts = staged.parts;
      final checksum = staged.checksum;
      await _db.write(() async {
        final existing = await get(id);
        if (existing != null) {
          if (existing['owner_ref'] != ownerRef ||
              existing['sha256'] != checksum ||
              existing['mime'] != mime ||
              existing['size_bytes'] != length ||
              existing['evidence_type'] != evidenceType ||
              existing['required_evidence'] != (requiredEvidence ? 1 : 0) ||
              existing['wifi_only'] != (wifiOnly ? 1 : 0)) {
            throw StateError('ATTACHMENT_IDENTITY_MISMATCH');
          }
          return;
        }
        await _db.customStatement(
          '''INSERT INTO local_attachment
          (id,owner_ref,evidence_type,path,sha256,mime,size_bytes,required_evidence,wifi_only,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)''',
          [
            id,
            ownerRef,
            evidenceType,
            stagingName,
            checksum,
            mime,
            length,
            requiredEvidence ? 1 : 0,
            wifiOnly ? 1 : 0,
            DateTime.now().toUtc().toIso8601String(),
          ],
        );
        for (final part in parts) {
          await _db.customStatement(
            'INSERT INTO attachment_part(attachment_id,part_no,offset_bytes,size_bytes,checksum) VALUES(?,?,?,?,?)',
            part,
          );
        }
        committed = true;
      });
      return id;
    } finally {
      if (!committed && await directory.exists()) {
        await directory.delete(recursive: true);
      }
    }
  }

  Future<Map<String, Object?>?> get(String id) async {
    _ensureOpen();
    final rows = await _db.rows('SELECT * FROM local_attachment WHERE id=?', [
      id,
    ]);
    return rows.isEmpty ? null : rows.single;
  }

  Future<List<Map<String, Object?>>> parts(String id) async {
    _ensureOpen();
    return _db.rows(
      'SELECT * FROM attachment_part WHERE attachment_id=? ORDER BY part_no',
      [id],
    );
  }

  Future<List<Map<String, Object?>>> readyUploads({
    required bool isWifi,
    bool forceMobile = false,
    int limit = 50,
  }) async {
    _ensureOpen();
    if (limit < 1 || limit > 500) throw ArgumentError('Invalid queue limit');
    return _db.rows(
      "SELECT * FROM local_attachment WHERE upload_state IN ('pending','uploading') "
      "AND (wifi_only=0 OR ?=1) ORDER BY created_at,id LIMIT ?",
      [isWifi || forceMobile ? 1 : 0, limit],
    );
  }

  Future<void> retryFailed(String id) async {
    _ensureOpen();
    await _db.write(() async {
      final row = await _required(id);
      if (row['upload_state'] != 'failed') {
        throw StateError('ATTACHMENT_NOT_FAILED');
      }
      await _db.customStatement(
        "UPDATE local_attachment SET upload_state='pending',error_code=NULL WHERE id=?",
        [id],
      );
    });
  }

  Future<void> bindUpload(
    String id, {
    required String remoteId,
    required String session,
  }) async {
    _ensureOpen();
    if (remoteId.isEmpty || session.isEmpty) {
      throw ArgumentError('Remote identity required');
    }
    await _db.write(() async {
      final row = await _required(id);
      if (row['remote_id'] != null &&
          (row['remote_id'] != remoteId || row['upload_session'] != session)) {
        throw StateError('UPLOAD_SESSION_MISMATCH');
      }
      if (row['upload_state'] == 'confirmed') return;
      await _db.customStatement(
        "UPDATE local_attachment SET remote_id=?,upload_session=?,upload_state='uploading',error_code=NULL WHERE id=?",
        [remoteId, session, id],
      );
    });
  }

  Future<Uint8List> readPart(
    String id,
    int number, {
    required bool isWifi,
    bool forceMobile = false,
  }) async {
    _ensureOpen();
    final row = await _required(id);
    if (row['wifi_only'] == 1 && !isWifi && !forceMobile) {
      throw StateError('WIFI_REQUIRED');
    }
    final part = (await parts(id)).where((v) => v['part_no'] == number).single;
    final path = row['path'] as String;
    if (path.isEmpty) throw StateError('ATTACHMENT_RETAINED_METADATA_ONLY');
    final encrypted = await File(
      p.join(_workspace.path, 'attachments', path, '$number.bin'),
    ).readAsBytes();
    return compute(_decryptPart, (
      bytes: encrypted,
      key: await _key.extractBytes(),
      aad: utf8.encode('$id:$number:${row['owner_ref']}'),
      size: part['size_bytes'] as int,
      checksum: part['checksum'] as String,
    ));
  }

  Future<void> acknowledgePart(
    String id,
    int number, {
    required String session,
    required String checksum,
  }) async {
    _ensureOpen();
    await _db.write(() async {
      final row = await _required(id);
      if (session.isEmpty || row['upload_session'] != session) {
        throw StateError('UPLOAD_SESSION_MISMATCH');
      }
      final matching = (await parts(id)).where((v) => v['part_no'] == number);
      if (matching.isEmpty || matching.single['checksum'] != checksum) {
        throw StateError('ATTACHMENT_HASH_MISMATCH');
      }
      await _db.customStatement(
        "UPDATE attachment_part SET status='confirmed' WHERE attachment_id=? AND part_no=?",
        [id, number],
      );
    });
  }

  Future<void> confirmRemote(
    String id, {
    required String remoteId,
    required String checksum,
    required String remoteState,
  }) async {
    _ensureOpen();
    await _db.write(() async {
      final row = await _required(id);
      if (remoteState != 'AVAILABLE' ||
          remoteId.isEmpty ||
          row['remote_id'] != remoteId ||
          row['sha256'] != checksum ||
          (await parts(id)).any((v) => v['status'] != 'confirmed')) {
        throw StateError('ATTACHMENT_NOT_CONFIRMED');
      }
      await _db.customStatement(
        "UPDATE local_attachment SET upload_state='confirmed',error_code=NULL WHERE id=?",
        [id],
      );
    });
  }

  Future<void> fail(String id, String code) async {
    _ensureOpen();
    if (!RegExp(r'^[A-Z][A-Z0-9_]{0,63}$').hasMatch(code)) {
      throw ArgumentError('Normalized error code required');
    }
    await _db.write(() async {
      final row = await _required(id);
      if (row['upload_state'] == 'confirmed') {
        throw StateError('ATTACHMENT_ALREADY_CONFIRMED');
      }
      await _db.customStatement(
        "UPDATE local_attachment SET upload_state='failed',error_code=? WHERE id=?",
        [code, id],
      );
    });
  }

  /// Retains metadata and command references. No pending evidence deletion API.
  Future<void> purgeConfirmedBytes(
    String id, {
    required DateTime retentionBefore,
  }) async {
    _ensureOpen();
    final row = await _required(id);
    if (row['upload_state'] != 'confirmed' ||
        DateTime.parse(row['created_at'] as String).isAfter(retentionBefore)) {
      throw StateError('ATTACHMENT_RETENTION_REQUIRED');
    }
    final path = row['path'] as String;
    if (path.isEmpty) return;
    final directory = Directory(p.join(_workspace.path, 'attachments', path));
    if (await directory.exists()) await directory.delete(recursive: true);
    await _db.customStatement(
      "UPDATE local_attachment SET path='' WHERE id=?",
      [id],
    );
  }

  Future<Map<String, Object?>> _required(String id) async =>
      (await get(id)) ?? (throw StateError('ATTACHMENT_NOT_FOUND'));
}

// File copy, hashing and AEAD work run off the UI isolate. Workers receive only
// primitive data and a short-lived key copy, never a DB handle or OS key store.
typedef _StageInput = ({
  String source,
  String directory,
  String id,
  String owner,
  String mime,
  int length,
  List<int> key,
});
typedef _StageOutput = ({String checksum, List<List<Object?>> parts});
Future<_StageOutput> _stageFile(_StageInput job) async {
  final source = File(job.source);
  final directory = Directory(job.directory);
  final id = job.id;
  final ownerRef = job.owner;
  final mime = job.mime;
  final length = job.length;
  final key = SecretKey(job.key);
  final cipher = AesGcm.with256bits();
  final parts = <List<Object?>>[];
  final digest = _DigestSink();
  final hash = sha256.startChunkedConversion(digest);
  final input = await source.open();
  var offset = 0;
  try {
    while (offset < length) {
      final expected = min(length - offset, attachmentPartBytes);
      final bytes = BytesBuilder(copy: false);
      while (bytes.length < expected) {
        final chunk = await input.read(expected - bytes.length);
        if (chunk.isEmpty) throw StateError('ATTACHMENT_SOURCE_CHANGED');
        bytes.add(chunk);
      }
      final plain = bytes.takeBytes();
      if (offset == 0 && !_matchesMime(plain, mime)) {
        throw StateError('ATTACHMENT_MIME_MISMATCH');
      }
      hash.add(plain);
      final number = parts.length + 1;
      final box = await cipher.encrypt(
        plain,
        secretKey: key,
        aad: utf8.encode('$id:$number:$ownerRef'),
      );
      await File(p.join(directory.path, '$number.bin'))
          .writeAsBytes(box.concatenation(), flush: true);
      parts.add([
        id,
        number,
        offset,
        plain.length,
        sha256.convert(plain).toString(),
      ]);
      offset += plain.length;
    }
    if (await source.length() != length) {
      throw StateError('ATTACHMENT_SOURCE_CHANGED');
    }
    hash.close();
    final checksum = digest.value!.toString();
    return (checksum: checksum, parts: parts);
  } finally {
    await input.close();
  }
}

typedef _DecryptInput = ({
  Uint8List bytes,
  List<int> key,
  List<int> aad,
  int size,
  String checksum,
});
Future<Uint8List> _decryptPart(_DecryptInput job) async {
  final plain = await AesGcm.with256bits().decrypt(
    SecretBox.fromConcatenation(job.bytes, nonceLength: 12, macLength: 16),
    secretKey: SecretKey(job.key),
    aad: job.aad,
  );
  if (plain.length != job.size ||
      sha256.convert(plain).toString() != job.checksum) {
    throw StateError('ATTACHMENT_HASH_MISMATCH');
  }
  return Uint8List.fromList(plain);
}

bool _matchesMime(Uint8List bytes, String mime) {
  bool prefix(List<int> value) =>
      bytes.length >= value.length &&
      List.generate(value.length, (i) => bytes[i] == value[i]).every((v) => v);
  return switch (mime) {
    'image/jpeg' => prefix([0xff, 0xd8, 0xff]),
    'image/png' => prefix([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
    'application/pdf' => prefix(utf8.encode('%PDF-')),
    'audio/mpeg' =>
      prefix(utf8.encode('ID3')) ||
          (bytes.length > 1 && bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0),
    'audio/mp4' =>
      bytes.length >= 12 &&
          utf8.decode(bytes.sublist(4, 8), allowMalformed: true) == 'ftyp',
    _ => false,
  };
}
