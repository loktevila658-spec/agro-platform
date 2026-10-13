import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { ORG_POOL } from './org.tokens';

@Module({
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
