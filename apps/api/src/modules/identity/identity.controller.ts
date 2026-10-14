import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';

type RequestContext = { correlationId?: string };

@Controller('v1/auth')
export class IdentityAuthController {
  constructor(private readonly identity: IdentityService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { login?: string; password?: string; deviceId?: string }, @Req() request: RequestContext) {
    return this.identity.login(body, request.correlationId);
  }
  @Post('mfa/verify')
  @HttpCode(200)
  verifyMfa(@Body() body: { challengeToken?: string; code?: string }, @Req() request: RequestContext) {
    return this.identity.verifyMfa(body, request.correlationId);
  }
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: { refreshToken?: string }, @Req() request: RequestContext) {
    return this.identity.refresh(body, request.correlationId);
  }
  @Post('logout')
  @HttpCode(200)
  async logout(@Headers('authorization') authorization: string | undefined, @Req() request: RequestContext) {
    const context = await this.identity.authenticate(authorization);
    return this.identity.logout(context, request.correlationId);
  }
}

@Controller('v1/me/sessions')
export class IdentitySessionsController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Req() request?: RequestContext) {
    const context = await this.identity.authenticate(authorization);
    return this.identity.listSessions(context, request?.correlationId);
  }

  @Post(':id/commands/revoke')
  @HttpCode(200)
  async revoke(@Param('id') id: string, @Headers('authorization') authorization?: string, @Req() request?: RequestContext) {
    if (!authorization) throw new UnauthorizedException('Authentication required');
    const context = await this.identity.authenticate(authorization);
    return this.identity.revoke(context, id, 'self_revoked', request?.correlationId);
  }
}
