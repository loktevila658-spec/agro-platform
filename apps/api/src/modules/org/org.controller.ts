import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

import {
  OrgRequestContext,
  OrgService,
  OrganizationCommand,
  OrganizationUnitCommand,
  SiteCommand,
  TenantCommand,
} from './org.service';

function context(authorization?: string, idempotencyKey?: string, correlationId?: string, causationId?: string): OrgRequestContext {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (authorization && !token) throw new UnauthorizedException('Bearer authorization is required');
  return { token, idempotencyKey, correlationId, causationId };
}

@Controller('org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Post('tenants')
  createTenant(
    @Body() body: TenantCommand,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('x-causation-id') causationId?: string,
  ) {
    return this.org.createTenant(body, context(authorization, idempotencyKey, correlationId, causationId));
  }

  @Post('organizations')
  createOrganization(
    @Body() body: OrganizationCommand,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('x-causation-id') causationId?: string,
  ) {
    return this.org.createOrganization(body, context(authorization, idempotencyKey, correlationId, causationId));
  }

  @Post('organization-units')
  createOrganizationUnit(
    @Body() body: OrganizationUnitCommand,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('x-causation-id') causationId?: string,
  ) {
    return this.org.createOrganizationUnit(body, context(authorization, idempotencyKey, correlationId, causationId));
  }

  @Post('sites')
  createSite(
    @Body() body: SiteCommand,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Headers('x-causation-id') causationId?: string,
  ) {
    return this.org.createSite(body, context(authorization, idempotencyKey, correlationId, causationId));
  }

  @Get('tenants/:tenantId/hierarchy')
  readHierarchy(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.org.readHierarchy(tenantId, context(authorization));
  }
}
