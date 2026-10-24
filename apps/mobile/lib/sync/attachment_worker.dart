import '../persistence/attachment_queue.dart';
import 'protocol.dart';

class AttachmentWorker {
  AttachmentWorker(this.queue, this.transport);
  final AttachmentQueue queue;
  final AttachmentTransport transport;
  bool _running = false;
  Future<void> run({required bool isWifi, bool forceMobile = false}) async {
    if (_running) return;
    _running = true;
    try {
      for (final candidate in await queue.readyUploads(
        isWifi: isWifi,
        forceMobile: forceMobile,
      )) {
        final id = candidate['id'] as String;
        try {
          var row = candidate;
          if (row['remote_id'] == null) {
            final ref = await transport.init(attachmentIntent(row));
            await queue.bindUpload(
              id,
              remoteId: ref.attachmentId,
              session: ref.session ?? ref.attachmentId,
            );
            row = (await queue.get(id))!;
          }
          final remote = row['remote_id'] as String,
              session = row['upload_session'] as String;
          for (final part in await queue.parts(id)) {
            if (part['status'] == 'confirmed') continue;
            final number = part['part_no'] as int;
            final checksum = part['checksum'] as String;
            final bytes = await queue.readPart(
              id,
              number,
              isWifi: isWifi,
              forceMobile: forceMobile,
            );
            final ack = await transport.part(
              id,
              remote,
              number,
              checksum,
              bytes,
            );
            if (ack.partNumber != number ||
                ack.sha256 != checksum ||
                ack.sizeBytes != bytes.length) {
              throw const SyncFailure('ATTACHMENT_HASH_MISMATCH', status: 400);
            }
            await queue.acknowledgePart(
              id,
              number,
              session: session,
              checksum: checksum,
            );
          }
          final ref = await transport.complete(id, remote);
          if (ref.localAttachmentId != id ||
              ref.ownerRef != row['owner_ref'] ||
              ref.evidenceType != row['evidence_type']) {
            throw const SyncFailure('ATTACHMENT_OWNER_MISMATCH', status: 400);
          }
          await queue.confirmRemote(
            id,
            remoteId: ref.attachmentId,
            checksum: ref.sha256,
            remoteState: ref.state,
          );
        } on SyncFailure catch (error) {
          if (!error.retryable) await queue.fail(id, error.code);
          // Transport failure leaves durable session and part ACKs for resume.
        } catch (_) {
          /* queue remains resumable; data sync is independent */
        }
      }
    } finally {
      _running = false;
    }
  }
}

SyncAttachmentIntent attachmentIntent(Map<String, Object?> a) =>
    SyncAttachmentIntent(
      localAttachmentId: a['id'] as String,
      ownerRef: a['owner_ref'] as String,
      evidenceType: a['evidence_type'] as String,
      sha256: a['sha256'] as String,
      mime: a['mime'] as String,
      sizeBytes: a['size_bytes'] as int,
      required: a['required_evidence'] == 1,
    );
