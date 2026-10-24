import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { IdentityAuthController, IdentitySessionsController } from './identity.controller';
import { IdentityService } from './identity.service';
import { IDENTITY_POOL } from './identity.tokens';

@Module({
  exports: [IdentityService],
  controllers: [IdentityAuthController, IdentitySessionsController],
  providers: [
    { provide: IDENTITY_POOL, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }) },
    IdentityService,
  ],
})
export class IdentityModule {}
