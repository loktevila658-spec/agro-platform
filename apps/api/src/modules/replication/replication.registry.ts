import { Injectable } from '@nestjs/common';
import { identifier } from './replication.validation';
import type { ReplicaBinding, ReplicaTransport } from './replication.types';
import { ReplicationError } from './replication.types';
@Injectable()
export class ReplicationRegistry {
  private readonly entries = new Map<string, { binding: Readonly<ReplicaBinding>; transport?: ReplicaTransport }>();
  /** Trusted bootstrap only. Distinct registries/pools for Local and Holding. */
  register(binding: ReplicaBinding, transport?: ReplicaTransport): void {
    if (![binding?.tenantId,binding?.siteId,binding?.installationId,binding?.subjectId].every(identifier) || typeof binding.key !== 'string' || Buffer.byteLength(binding.key) < 32 ||
      !Number.isSafeInteger(binding.timeoutMs) || binding.timeoutMs < 1 || binding.timeoutMs > 60000 ||
      !Number.isSafeInteger(binding.pollMs) || binding.pollMs < 100 || binding.pollMs > 3600000 ||
      !Number.isSafeInteger(binding.maxAttempts) || binding.maxAttempts < 1 || binding.maxAttempts > 100 ||
      (transport && (transport.protocol !== 'https:' || typeof transport.send !== 'function'))) throw new ReplicationError('INVALID_BINDING');
    if (this.entries.has(binding.tenantId)) throw new ReplicationError('BINDING_IMMUTABLE');
    this.entries.set(binding.tenantId,Object.freeze({binding:Object.freeze({...binding}), ...(transport ? {transport:Object.freeze({protocol:'https:' as const,send:transport.send.bind(transport)})} : {})}));
  }
  activeTenants(): readonly string[] { return Object.freeze([...this.entries].filter(([,entry])=>!!entry.transport).map(([tenantId])=>tenantId)); }
  get(tenantId: string): { binding: Readonly<ReplicaBinding>; transport?: ReplicaTransport } | undefined { return this.entries.get(tenantId); }
}
