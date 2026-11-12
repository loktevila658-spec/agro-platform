import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { IdentityModule } from '../identity/identity.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { IdentityTagsController } from './identity-tags.controller';
import { IdentityTagsRegistry } from './identity-tags.registry';
import { IdentityTagsService, TAGS_POOL } from './identity-tags.service';
@Module({imports: [IdentityModule, MasterDataModule], controllers: [IdentityTagsController], providers: [
  {provide: TAGS_POOL, useFactory: () => new Pool({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 5000})},
  IdentityTagsRegistry, IdentityTagsService,
], exports: [IdentityTagsRegistry, IdentityTagsService]})
export class IdentityTagsModule {}
