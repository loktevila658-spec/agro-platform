import type { PoolClient } from 'pg';

export type EventSource = 'org' | 'identity' | 'master-data' | 'gis' | 'land' | 'farm' | 'tasks';

export interface DomainEvent {
  id: string;
  source: EventSource;
  eventName: string;
  eventVersion: string;
  producer: string;
  entityId: string;
  tenantId: string | null;
  actorId: string | null;
  correlationId: string | null;
  causationId: string | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface EventHandler {
  name: string;
  handle(client: PoolClient, event: DomainEvent): Promise<void>;
}
