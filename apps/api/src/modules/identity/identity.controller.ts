import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';

type RequestContext = { correlationId?: string };
function correlation(request: RequestContext): string | undefined { return request.correlationId; }

@Controller('v1/auth')
export class IdentityAuthController {
  constructor(private readonly identity: IdentityService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { login?: string; password?: string; deviceId?: string }, @Req() request: RequestContext, @Headers('x-correlation-id') header?: string) {
    return this.identity.login(body, header ?? correlation(request));
  }
  @Post('mfa/verify')
  @HttpCode(200)
  verifyMfa(@Body() body: { challengeToken?: string; code?: string }, @Req() request: RequestContext, @Headers('x-correlation-id') header?: string) {
    return this.identity.verifyMfa(body, header ?? correlation(request));
  }
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: { refreshToken?: string }, @Req() request: RequestContext, @Headers('x-correlation-id') header?: string) {
    return this.identity.refresh(body, header ?? correlation(request));
  }
  @Post('logout')
  @HttpCode(200)
  async logout(@Headers('authorization') authorization: string | undefined, @Req() request: RequestContext, @Headers('x-correlation-id') header?: string) {
    const context = await this.identity.authenticate(authorization);
    return this.identity.logout(context, header ?? correlation(request));
  }
}

@Controller('v1/me/sessions')
export class IdentitySessionsController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  async list(@Headers('authorization') authorization?: string, @Req() request?: RequestContext, @Headers('x-correlation-id') header?: string) {
    const context = await this.identity.authenticate(authorization);
    return this.identity.listSessions(context, header ?? (request ? correlation(request) : undefined));
  }

  @Post(':id/commands/revoke')
  @HttpCode(200)
  async revoke(@Param('id') id: string, @Headers('authorization') authorization?: string, @Req() request?: RequestContext, @Headers('x-correlation-id') header?: string) {
    if (!authorization) throw new UnauthorizedException('Authentication required');
    const context = await this.identity.authenticate(authorization);
    return this.identity.revoke(context, id, 'self_revoked', header ?? (request ? correlation(request) : undefined));
  }
}
