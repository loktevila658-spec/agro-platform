import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  OnModuleDestroy,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { Inject } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import { ORG_POOL } from './org.tokens';

const ACTIONS = new Set([
  'org.hierarchy.read',
  'org.tenant.create',
  'org.organization.create',
  'org.organization_unit.create',
  'org.site.create',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface OrgRequestContext {
  readonly token?: string;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export interface TenantCommand { readonly code: string; readonly name: string; readonly timezone: string; }
export interface OrganizationCommand { readonly tenantId: string; readonly code: string; readonly name: string; readonly organizationType: string; }
export interface OrganizationUnitCommand { readonly tenantId: string; readonly organizationId: string; readonly parentId?: string; readonly code: string; readonly name: string; readonly unitType: string; }
export interface SiteCommand { readonly tenantId: string; readonly organizationId: string; readonly organizationUnitId?: string; readonly code: string; readonly name: string; readonly siteType: string; readonly address?: string; readonly timezone: string; }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requireText(value: unknown, key: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max) {
    throw new BadRequestException(`${key} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function requireUuid(value: unknown, key: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException(`${key} must be a UUID`);
  return value;
}

function validateContext(context: OrgRequestContext): { correlationId: string; causationId: string; idempotencyKey: string } {
  const correlationId = context.correlationId ?? randomUUID();
  const causationId = context.causationId ?? correlationId;
  const key = context.idempotencyKey;
  if (!CORRELATION.test(correlationId) || !CORRELATION.test(causationId)) throw new BadRequestException('Invalid correlation or causation identifier');
  if (typeof key !== 'string' || key.length < 1 || key.length > 200) throw new BadRequestException('Idempotency-Key header is required and must be at most 200 characters');
  return { correlationId, causationId, idempotencyKey: key };
}

@Injectable()
export class OrgService implements OnModuleDestroy {
  constructor(@Inject(ORG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  // Bootstrap identity is server-configured: bearer credential, actor UUID, permissions and tenant scopes never come from client claims.
  private authorize(context: OrgRequestContext, action: string, tenantScope?: unknown): string {
    const expectedToken = process.env.ORG_BOOTSTRAP_TOKEN;
    const actorId = process.env.ORG_BOOTSTRAP_ACTOR_ID;
    const permissions = (process.env.ORG_BOOTSTRAP_PERMISSIONS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    if (!expectedToken || !actorId || !UUID.test(actorId) || !context.token) throw new UnauthorizedException('Organization actor is not authenticated');
    const provided = Buffer.from(context.token);
    const expected = Buffer.from(expectedToken);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new UnauthorizedException('Organization actor is not authenticated');
    if (!permissions.every((permission) => ACTIONS.has(permission)) || !permissions.includes(action)) throw new ForbiddenException('Permission denied');
    if (tenantScope !== undefined) {
      const tenantId = typeof tenantScope === 'string' ? tenantScope : '';
      const tenantScopes = (process.env.ORG_BOOTSTRAP_TENANT_IDS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
      if (!UUID.test(tenantId) || !tenantScopes.includes(tenantId)) throw new ForbiddenException('Permission denied for tenant scope');
    }
    return actorId;
  }

  async readHierarchy(tenantIdInput: string, context: OrgRequestContext): Promise<Record<string, unknown>> {
    this.authorize(context, 'org.hierarchy.read', tenantIdInput);
    const tenantId = requireUuid(tenantIdInput, 'tenantId');
    if (!process.env.DATABASE_URL) throw new ServiceUnavailableException('PostgreSQL is not configured');
    try {
      const tenant = await this.pool.query('SELECT id, code, name, timezone, created_at AS "createdAt" FROM org.tenant WHERE id = $1', [tenantId]);
      if (!tenant.rowCount) throw new NotFoundException('Tenant not found');
      const [organizations, units, sites] = await Promise.all([
        this.pool.query('SELECT id, tenant_id AS "tenantId", code, name, organization_type AS "organizationType", created_at AS "createdAt" FROM org.organization WHERE tenant_id = $1 ORDER BY code', [tenantId]),
        this.pool.query('SELECT id, organization_id AS "organizationId", parent_id AS "parentId", code, name, unit_type AS "unitType", created_at AS "createdAt" FROM org.organization_unit WHERE tenant_id = $1 ORDER BY code', [tenantId]),
        this.pool.query('SELECT id, organization_id AS "organizationId", organization_unit_id AS "organizationUnitId", code, name, site_type AS "siteType", address, timezone, created_at AS "createdAt" FROM org.site WHERE tenant_id = $1 ORDER BY code', [tenantId]),
      ]);
      return {
        tenantId: tenant.rows[0].id,
        tenantCode: tenant.rows[0].code,
        tenantName: tenant.rows[0].name,
        organizationsJson: JSON.stringify(organizations.rows),
        organizationUnitsJson: JSON.stringify(units.rows),
        sitesJson: JSON.stringify(sites.rows),
      };
    } catch (error) {
      this.mapDatabaseError(error);
    }
  }

  async createTenant(commandInput: TenantCommand, context: OrgRequestContext): Promise<Record<string, unknown>> {
    const actorId = this.authorize(context, 'org.tenant.create');
    const command = {
      code: requireText(commandInput?.code, 'code', 64),
      name: requireText(commandInput?.name, 'name'),
      timezone: requireText(commandInput?.timezone, 'timezone', 64),
    };
    return this.execute({
      action: 'org.tenant.create', entityType: 'tenant', actorId, context, command,
      scope: actorId,
      eventName: 'org.tenant.created',
      insert: async (client) => {
        const { rows } = await client.query('INSERT INTO org.tenant(code, name, timezone, created_by) VALUES ($1,$2,$3,$4) RETURNING id, code, name, timezone, created_at AS "createdAt"', [command.code, command.name, command.timezone, actorId]);
        return rows[0];
      },
    });
  }

  async createOrganization(commandInput: OrganizationCommand, context: OrgRequestContext): Promise<Record<string, unknown>> {
    const actorId = this.authorize(context, 'org.organization.create', commandInput?.tenantId);
    const command = {
      tenantId: requireUuid(commandInput?.tenantId, 'tenantId'),
      code: requireText(commandInput?.code, 'code', 64),
      name: requireText(commandInput?.name, 'name'),
      organizationType: requireText(commandInput?.organizationType, 'organizationType', 64),
    };
    if (!['LEGAL_ENTITY', 'SOLE_PROPRIETOR', 'FARM', 'OPERATING_UNIT'].includes(command.organizationType)) throw new BadRequestException('Unsupported organizationType');
    return this.execute({
      action: 'org.organization.create', entityType: 'organization', actorId, context, command,
      scope: command.tenantId, tenantId: command.tenantId,
      eventName: 'org.organization.created',
      validateHierarchy: async () => {
        const result = await this.pool.query('SELECT 1 FROM org.tenant WHERE id = $1', [command.tenantId]);
        if (!result.rowCount) throw new ConflictException('Tenant does not exist');
      },
      insert: async (client) => {
        const { rows } = await client.query('INSERT INTO org.organization(tenant_id, code, name, organization_type, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, tenant_id AS "tenantId", code, name, organization_type AS "organizationType", created_at AS "createdAt"', [command.tenantId, command.code, command.name, command.organizationType, actorId]);
        return rows[0];
      },
    });
  }

  async createOrganizationUnit(commandInput: OrganizationUnitCommand, context: OrgRequestContext): Promise<Record<string, unknown>> {
    const actorId = this.authorize(context, 'org.organization_unit.create', commandInput?.tenantId);
    const command = {
      tenantId: requireUuid(commandInput?.tenantId, 'tenantId'), organizationId: requireUuid(commandInput?.organizationId, 'organizationId'),
      parentId: commandInput?.parentId === undefined ? null : requireUuid(commandInput.parentId, 'parentId'),
      code: requireText(commandInput?.code, 'code', 64), name: requireText(commandInput?.name, 'name'), unitType: requireText(commandInput?.unitType, 'unitType', 64),
    };
    return this.execute({
      action: 'org.organization_unit.create', entityType: 'organization_unit', actorId, context, command,
      scope: command.tenantId, tenantId: command.tenantId,
      eventName: 'org.unit.created',
      validateHierarchy: async () => {
        const organization = await this.pool.query('SELECT 1 FROM org.organization WHERE id = $1 AND tenant_id = $2', [command.organizationId, command.tenantId]);
        if (!organization.rowCount) throw new ConflictException('Organization does not belong to tenant');
        if (command.parentId) {
          const parent = await this.pool.query('SELECT 1 FROM org.organization_unit WHERE id = $1 AND organization_id = $2', [command.parentId, command.organizationId]);
          if (!parent.rowCount) throw new ConflictException('Parent unit does not belong to organization');
        }
      },
      insert: async (client) => {
        const { rows } = await client.query('INSERT INTO org.organization_unit(tenant_id, organization_id, parent_id, code, name, unit_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, tenant_id AS "tenantId", organization_id AS "organizationId", parent_id AS "parentId", code, name, unit_type AS "unitType", created_at AS "createdAt"', [command.tenantId, command.organizationId, command.parentId, command.code, command.name, command.unitType, actorId]);
        return rows[0];
      },
    });
  }

  async createSite(commandInput: SiteCommand, context: OrgRequestContext): Promise<Record<string, unknown>> {
    const actorId = this.authorize(context, 'org.site.create', commandInput?.tenantId);
    const command = {
      tenantId: requireUuid(commandInput?.tenantId, 'tenantId'), organizationId: requireUuid(commandInput?.organizationId, 'organizationId'),
      organizationUnitId: commandInput?.organizationUnitId === undefined ? null : requireUuid(commandInput.organizationUnitId, 'organizationUnitId'),
      code: requireText(commandInput?.code, 'code', 64), name: requireText(commandInput?.name, 'name'),
      siteType: requireText(commandInput?.siteType, 'siteType', 64), address: commandInput?.address === undefined ? null : requireText(commandInput.address, 'address'),
      timezone: requireText(commandInput?.timezone, 'timezone', 64),
    };
    if (!['BASE', 'FARM', 'WAREHOUSE_SITE', 'WEIGH_SITE', 'PRODUCTION_SITE', 'REPAIR_BASE', 'FUEL_SITE'].includes(command.siteType)) throw new BadRequestException('Unsupported siteType');
    return this.execute({
      action: 'org.site.create', entityType: 'site', actorId, context, command,
      scope: command.tenantId, tenantId: command.tenantId,
      eventName: 'org.site.created',
      validateHierarchy: async () => {
        const organization = await this.pool.query('SELECT 1 FROM org.organization WHERE id = $1 AND tenant_id = $2', [command.organizationId, command.tenantId]);
        if (!organization.rowCount) throw new ConflictException('Organization does not belong to tenant');
        if (command.organizationUnitId) {
          const unit = await this.pool.query('SELECT 1 FROM org.organization_unit WHERE id = $1 AND organization_id = $2', [command.organizationUnitId, command.organizationId]);
          if (!unit.rowCount) throw new ConflictException('Organization unit does not belong to organization');
        }
      },
      insert: async (client) => {
        const { rows } = await client.query('INSERT INTO org.site(tenant_id, organization_id, organization_unit_id, code, name, site_type, address, timezone, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, tenant_id AS "tenantId", organization_id AS "organizationId", organization_unit_id AS "organizationUnitId", code, name, site_type AS "siteType", address, timezone, created_at AS "createdAt"', [command.tenantId, command.organizationId, command.organizationUnitId, command.code, command.name, command.siteType, command.address, command.timezone, actorId]);
        return rows[0];
      },
    });
  }

  private async execute(input: {
    action: string; entityType: string; actorId: string; context: OrgRequestContext; command: Record<string, unknown>;
    scope: string; tenantId?: string; eventName: string; validateHierarchy?: () => Promise<void>; insert: (client: PoolClient) => Promise<Record<string, unknown>>;
  }): Promise<Record<string, unknown>> {
    const ids = validateContext(input.context);
    if (!process.env.DATABASE_URL) throw new ServiceUnavailableException('PostgreSQL is not configured');
    const payloadHash = createHash('sha256').update(stableJson(input.command)).digest('hex');
    try {
      await input.validateHierarchy?.();
    } catch (error) {
      this.mapDatabaseError(error);
    }
    const client = await this.pool.connect().catch(() => { throw new ServiceUnavailableException('PostgreSQL is unavailable'); });
    try {
      await client.query('BEGIN');
      const reservation = await client.query(
        'INSERT INTO org.command_idempotency(scope_id, idempotency_key, command_name, payload_sha256, response) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING idempotency_key',
        [input.scope, ids.idempotencyKey, input.action, payloadHash, JSON.stringify({ pending: true })],
      );
      if (!reservation.rowCount) {
        const previous = await client.query('SELECT command_name, payload_sha256, response FROM org.command_idempotency WHERE scope_id = $1 AND idempotency_key = $2 FOR UPDATE', [input.scope, ids.idempotencyKey]);
        if (previous.rows[0]?.command_name !== input.action || previous.rows[0]?.payload_sha256 !== payloadHash) throw new ConflictException('Idempotency key was already used for a different command payload');
        await client.query('COMMIT');
        return previous.rows[0].response as Record<string, unknown>;
      }
      const row = await input.insert(client);
      const entityId = String(row.id);
      const occurredAt = new Date().toISOString();
      const tenantId = input.tenantId ?? entityId;
      const eventId = randomUUID();
      const payload = {
        eventId, entityId, entityType: input.entityType, tenantId, actorId: input.actorId,
        correlationId: ids.correlationId, causationId: ids.causationId, occurredAt,
      };
      const response = { ...row, correlationId: ids.correlationId };
      await client.query(
        'INSERT INTO org.audit_entry(tenant_id, actor_id, action, entity_type, entity_id, correlation_id, causation_id, occurred_at, change) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [tenantId, input.actorId, input.action, input.entityType, entityId, ids.correlationId, ids.causationId, occurredAt, JSON.stringify({ after: row })],
      );
      await client.query(
        'INSERT INTO org.outbox_event(id, tenant_id, event_name, event_version, producer, entity_type, entity_id, correlation_id, causation_id, occurred_at, payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [eventId, tenantId, input.eventName, '1.0.0', 'org', input.entityType, entityId, ids.correlationId, ids.causationId, occurredAt, JSON.stringify(payload)],
      );
      await client.query('UPDATE org.command_idempotency SET response = $3 WHERE scope_id = $1 AND idempotency_key = $2', [input.scope, ids.idempotencyKey, JSON.stringify(response)]);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof HttpException) throw error;
      this.mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  private mapDatabaseError(error: unknown): never {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === '23505') throw new ConflictException('Organization hierarchy code already exists');
    if (code === '23503' || code === '23514' || code === '22P02') throw new ConflictException('Invalid organization hierarchy relationship');
    if (error instanceof HttpException) throw error;
    throw new ServiceUnavailableException('PostgreSQL operation failed');
  }
}
