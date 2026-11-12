import { ForbiddenException, Injectable } from '@nestjs/common';
import { TAG_ACTIONS, type TagActor, type TagAction, type TagPolicy } from './identity-tags.types';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
@Injectable()
export class IdentityTagsRegistry {
  private policy: TagPolicy = async () => false;
  private installed = false;
  installPolicy(policy: TagPolicy): void {
    if (this.installed || typeof policy !== 'function') throw Error('QR_POLICY_IMMUTABLE');
    this.policy = policy; this.installed = true;
  }
  async authorize(actor: TagActor, action: TagAction): Promise<void> {
    let allowed = false;
    try { allowed = uuid.test(actor?.tenantId) && uuid.test(actor?.subjectId) && TAG_ACTIONS.has(action) && await this.policy(Object.freeze({...actor}), action); } catch { allowed = false; }
    if (!allowed) throw new ForbiddenException('QR_FORBIDDEN');
  }
}
