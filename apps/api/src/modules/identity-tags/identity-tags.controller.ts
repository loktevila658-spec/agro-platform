import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IdentityService } from '../identity/identity.service';
import { IdentityTagsService } from './identity-tags.service';
@Controller('v1')
export class IdentityTagsController {
  constructor(private readonly service: IdentityTagsService, private readonly identity: IdentityService) {}
  private async actor(auth?: string) { const a = await this.identity.authenticate(auth); return {tenantId: a.tenantId, subjectId: a.userId}; }
  @Post('qr/resolve') @HttpCode(200)
  async resolve(@Body() body: unknown, @Headers('authorization') auth?: string) { return this.service.resolve(await this.actor(auth), body); }
  @Post('qr-codes') @HttpCode(200)
  async issue(@Body() body: unknown, @Headers('authorization') auth?: string, @Headers('idempotency-key') key?: string, @Headers('x-correlation-id') correlationId?: string) {
    return this.service.issue(await this.actor(auth), body, {idempotencyKey: key ?? '', correlationId: correlationId ?? randomUUID()});
  }
}
