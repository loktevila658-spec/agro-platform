import 'dart:typed_data';

export '../generated/contracts.dart';
import '../generated/contracts.dart';

class SyncFailure implements Exception {
  const SyncFailure(this.code, {this.status, this.retryAfter});
  final String code;
  final int? status;
  final Duration? retryAfter;
  bool get retryable => status == null || status == 429 || (status! >= 500);
}

abstract interface class SyncTransport {
  Future<SyncRegisterResponse> register(SyncRegisterRequest request);
  Future<SyncBootstrapResponse> bootstrap(SyncBootstrapRequest request);
  Future<SyncPushResponse> push(SyncPushRequest request);
  Future<SyncPullResponse> pull(SyncPullRequest request);
  Future<void> ack(SyncAckRequest request);
}

abstract interface class AttachmentTransport {
  Future<SyncUploadResponse> init(SyncAttachmentIntent intent);
  Future<SyncPartResponse> part(
    String localId,
    String remoteId,
    int number,
    String checksum,
    Uint8List bytes,
  );
  Future<SyncAttachmentResponse> complete(String localId, String remoteId);
}
