import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { FilesService } from '../files/files.service';
import { SyncService, validateAttachment } from './sync.service';
import { AttachmentIntent, SyncActor } from './sync.types';
@Injectable()
export class SyncFiles {
  constructor(readonly sync:SyncService, readonly files:FilesService) {}
  private actor(actor:SyncActor) { return { tenantId:actor.tenantId,actorId:actor.userId }; }
  async init(auth:string|undefined, intent:AttachmentIntent) {
    const actor=await this.sync.registeredActor(auth); validateAttachment(intent);
    // File owner permission is evaluated by FilesService before durable binding.
    const reference=await this.files.initUpload(this.actor(actor),{ ownerRef:intent.ownerRef,evidenceType:intent.evidenceType,sizeBytes:intent.sizeBytes,declaredMime:intent.mime,idempotencyKey:intent.localAttachmentId });
    const client=await this.sync.pool.connect();
    try { await client.query('BEGIN'); await this.sync.referenceIntent(client,actor,intent); await client.query('COMMIT'); } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    return { ...reference,session:reference.attachmentId };
  }
  private async intent(actor:SyncActor, localId:string) {
    const row=(await this.sync.pool.query('SELECT intent,remote_id FROM sync.attachment_reference WHERE tenant_id=$1 AND local_id=$2 AND user_id=$3 AND device_id=$4',[actor.tenantId,localId,actor.userId,actor.deviceId])).rows[0];
    if (!row) throw new ForbiddenException('Attachment binding mismatch'); return row.intent as AttachmentIntent;
  }
  async part(auth:string|undefined, localId:string, remoteId:string, part:number, checksum:string, bytes:Buffer) {
    const actor=await this.sync.registeredActor(auth); const intent=await this.intent(actor,localId);
    if (!Number.isSafeInteger(part) || part<1 || bytes.length>5*1024*1024) throw new BadRequestException('Attachment part limit');
    const ref=await this.files.initUpload(this.actor(actor),{ownerRef:intent.ownerRef,evidenceType:intent.evidenceType,sizeBytes:intent.sizeBytes,declaredMime:intent.mime,idempotencyKey:localId});
    if(ref.attachmentId!==remoteId) throw new ForbiddenException('Attachment binding mismatch');
    return this.files.uploadPart(this.actor(actor),remoteId,{partNumber:part,expectedSha256:checksum,body:Readable.from([bytes])});
  }
  async complete(auth:string|undefined, localId:string, remoteId:string) {
    const actor=await this.sync.registeredActor(auth); const intent=await this.intent(actor,localId);
    const ref=await this.files.initUpload(this.actor(actor),{ownerRef:intent.ownerRef,evidenceType:intent.evidenceType,sizeBytes:intent.sizeBytes,declaredMime:intent.mime,idempotencyKey:localId});
    if(ref.attachmentId!==remoteId) throw new ForbiddenException('Attachment binding mismatch');
    await this.files.completeUpload(this.actor(actor),remoteId,intent.sha256);
    const available=await this.files.getAvailableReference(this.actor(actor),remoteId);
    if(available.sha256!==intent.sha256 || available.ownerRef!==intent.ownerRef || available.evidenceType!==intent.evidenceType) throw new ForbiddenException('Attachment binding mismatch');
    await this.sync.pool.query('UPDATE sync.attachment_reference SET remote_id=$3 WHERE tenant_id=$1 AND local_id=$2',[actor.tenantId,localId,remoteId]);
    return { ...available,localAttachmentId:localId };
  }
}
