import { Injectable } from '@nestjs/common';
import { IntegrationsRegistry, IntegrationActor } from '../integrations/integrations.registry';
import { PROVIDER_ERRORS, ProviderError } from './providers.contracts.v1';
import type { ProviderDescriptor, ProviderKind, ProviderPort, ProviderQuery, ProviderResult, ReadOptions, Snapshot } from './providers.contracts.v1';
import { identifier, immutable, instant, matchesQuery, validateBatch, validateDescriptor, validateQuery } from './providers.validation';

@Injectable()
export class ProvidersService {
  private readonly ports = new Map<string, { descriptor: ProviderDescriptor; port: ProviderPort<ProviderKind> }>();
  constructor(private readonly registry: IntegrationsRegistry) {}

  /** Trusted composition only. No public endpoint, mutable profile, credential or vendor installed. */
  register<K extends ProviderKind>(tenantId: string, profileId: string, descriptor: ProviderDescriptor & { kind: K }, port: ProviderPort<K>): void {
    validateDescriptor(descriptor);
    if (!identifier(tenantId) || !identifier(profileId) || typeof port?.read !== 'function') throw new ProviderError('INVALID_REQUEST');
    const key = JSON.stringify([tenantId, profileId]);
    if (this.ports.has(key)) throw Error('DUPLICATE_PROVIDER_PROFILE');
    this.ports.set(key, { descriptor: immutable(structuredClone(descriptor)), port: {read: port.read.bind(port)} });
  }

  async read(actor: IntegrationActor, profileId: string, query: ProviderQuery, options: ReadOptions): Promise<ProviderResult> {
    if (process.env.AGRO_DEPLOYMENT_MODE !== 'LOCAL_PRIMARY') throw Error('LOCAL_PRIMARY_REQUIRED');
    // Both arguments and identities are copied before any await. Actors come from trusted auth.
    const currentActor = {...actor};
    const request = structuredClone(query);
    const settings = {...options};
    await this.registry.authorize(currentActor, 'READ', profileId);
    validateQuery(request);
    if (!identifier(profileId) || !identifier(settings.correlationId) || !Number.isSafeInteger(settings.timeoutMs) ||
        settings.timeoutMs < 1 || settings.timeoutMs > 2147483647 || !Number.isSafeInteger(settings.maxAgeMs) || settings.maxAgeMs < 0 || !instant(settings.now)) {
      throw new ProviderError('INVALID_REQUEST');
    }
    immutable(request);
    const base = {profileId, correlationId: settings.correlationId};
    const entry = this.ports.get(JSON.stringify([currentActor.tenantId, profileId]));
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    let result: ProviderResult;
    try {
      if (!entry) throw new ProviderError('UNAVAILABLE');
      if (['PORTAL_ONLY', 'DISCOVERY_REQUIRED'].includes(entry.descriptor.access)) throw new ProviderError('UNAVAILABLE');
      if (entry.descriptor.kind !== request.kind) throw new ProviderError('INVALID_REQUEST');
      const raw = await Promise.race([
        Promise.resolve().then(() => entry.port.read(request, Object.freeze({tenantId: currentActor.tenantId, profileId,
          correlationId: settings.correlationId, signal: controller.signal}))),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new ProviderError('TIMEOUT')); controller.abort(); }, settings.timeoutMs); }),
      ]);
      const records = validateBatch(raw, entry.descriptor, settings.now, settings.maxAgeMs);
      if (records.some(r => !matchesQuery(r.snapshot as Snapshot, request))) throw new ProviderError('INVALID_RESPONSE');
      result = {...base, status: records.length ? 'AVAILABLE' : 'MISSING', records};
    } catch (error) {
      const code = error instanceof ProviderError && PROVIDER_ERRORS.includes(error.code) ? error.code : 'TEMPORARY';
      const delay = error instanceof ProviderError ? error.retryAfterMs : undefined;
      result = {...base, status: 'ERROR', records: [], error: {code, retryable: ['TIMEOUT', 'TEMPORARY', 'RATE_LIMIT', 'UNAVAILABLE'].includes(code),
        ...(Number.isSafeInteger(delay) && (delay as number) >= 0 ? {retryAfterMs: delay} : {})}};
    } finally {
      if (timer) clearTimeout(timer);
    }
    // A slow provider cannot release evidence under permissions revoked during the read.
    await this.registry.authorize(currentActor, 'READ', profileId);
    return immutable(result);
  }
}
