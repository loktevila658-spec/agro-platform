import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'protocol.dart';

/// Immutable authority URI comes from provisioned LOCAL_PRIMARY workspace.
/// Redirects are disabled: reconnect cannot silently route writes to Cloud.
class AuthorityHttpTransport implements SyncTransport, AttachmentTransport {
  AuthorityHttpTransport({
    required this.authority,
    required this.accessToken,
    HttpClient? client,
  }) : client = client ?? HttpClient() {
    if (!{'https', 'http'}.contains(authority.scheme) ||
        authority.host.isEmpty ||
        authority.userInfo.isNotEmpty) {
      throw ArgumentError('Provisioned authority required');
    }
    api = AgroPlatformApiClient(
      baseUri: authority,
      transport: (uri, method) => _send(uri, method),
      requestTransport: _send,
      binaryTransport: (uri, method, {required headers, required body}) =>
          _send(uri, method, headers: headers, bytes: body),
    );
  }
  final Uri authority;
  final Future<String> Function() accessToken;
  final HttpClient client;
  late final AgroPlatformApiClient api;
  Future<String> get _auth async => 'Bearer ${await accessToken()}';
  Future<Map<String, Object?>> _send(
    Uri uri,
    String method, {
    Map<String, String>? headers,
    String? body,
    Uint8List? bytes,
  }) async {
    if (uri.origin != authority.origin) {
      throw const SyncFailure('AUTHORITY_MODE_MISMATCH', status: 403);
    }
    try {
      final request = await client
          .openUrl(method, uri)
          .timeout(const Duration(seconds: 30));
      request.followRedirects = false;
      headers?.forEach((key, value) => request.headers.set(key, value));
      if (bytes != null) {
        request.headers.contentType = ContentType.binary;
        request.add(bytes);
      } else if (body != null) {
        request.write(body);
      }
      final response = await request.close().timeout(
        const Duration(seconds: 30),
      );
      final data = <int>[];
      await for (final chunk in response.timeout(const Duration(seconds: 30))) {
        if (data.length + chunk.length > 2 * 1024 * 1024) {
          throw const SyncFailure('SYNC_RESPONSE_LIMIT');
        }
        data.addAll(chunk);
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final value = response.headers.value('retry-after');
        final seconds = int.tryParse(value ?? '');
        DateTime? date;
        if (value != null && seconds == null) {
          try {
            date = HttpDate.parse(value);
          } catch (_) {}
        }
        final after = seconds != null
            ? Duration(seconds: seconds.clamp(0, 86400))
            : date?.difference(DateTime.now().toUtc());
        String code = 'HTTP_${response.statusCode}';
        try {
          final message = (jsonDecode(utf8.decode(data)) as Map)['message'];
          if (message is String &&
              const {
                'SCOPE_VERSION_MISMATCH',
                'SYNC_SCHEMA_UNSUPPORTED',
                'IDEMPOTENCY_PAYLOAD_MISMATCH',
                'AUTHORITY_MODE_MISMATCH',
                'PERMISSION_CHANGED_OFFLINE',
              }.contains(message)) {
            code = message;
          }
        } catch (_) {}
        throw SyncFailure(code, status: response.statusCode, retryAfter: after);
      }
      return Map<String, Object?>.from(jsonDecode(utf8.decode(data)) as Map);
    } on SyncFailure {
      rethrow;
    } catch (_) {
      throw const SyncFailure('TRANSPORT_UNAVAILABLE');
    }
  }

  @override
  Future<SyncRegisterResponse> register(SyncRegisterRequest request) async =>
      api.registerSyncDevice(authorization: await _auth, body: request);
  @override
  Future<SyncBootstrapResponse> bootstrap(SyncBootstrapRequest request) async =>
      api.bootstrapSync(authorization: await _auth, body: request);
  @override
  Future<SyncPushResponse> push(SyncPushRequest request) async =>
      api.pushSync(authorization: await _auth, body: request);
  @override
  Future<SyncPullResponse> pull(SyncPullRequest request) async =>
      api.pullSync(authorization: await _auth, body: request);
  @override
  Future<void> ack(SyncAckRequest request) async {
    await api.ackSync(authorization: await _auth, body: request);
  }

  @override
  Future<SyncUploadResponse> init(SyncAttachmentIntent intent) async =>
      api.initSyncAttachment(authorization: await _auth, body: intent);
  @override
  Future<SyncPartResponse> part(
    String localId,
    String remoteId,
    int number,
    String checksum,
    Uint8List bytes,
  ) async => SyncPartResponse.fromJson(
    await _send(
      authority.resolve(
        '/v1/attachments/${Uri.encodeComponent(localId)}/parts/$number',
      ),
      'PUT',
      headers: {
        'Authorization': await _auth,
        'X-Remote-Id': remoteId,
        'X-Part-Sha256': checksum,
      },
      bytes: bytes,
    ),
  );
  @override
  Future<SyncAttachmentResponse> complete(
    String localId,
    String remoteId,
  ) async => api.completeSyncAttachment(
    localId: localId,
    authorization: await _auth,
    body: SyncCompleteRequest(remoteId: remoteId),
  );
  void close() => client.close(force: true);
}
