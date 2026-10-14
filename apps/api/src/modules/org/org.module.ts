import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import { PermissionsModule } from '../permissions/permissions.module';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { ORG_POOL } from './org.tokens';

@Module({
  imports: [PermissionsModule],
  controllers: [OrgController],
  providers: [
    {
      provide: ORG_POOL,
      useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
    },
    OrgService,
  ],
})
export class OrgModule {}
