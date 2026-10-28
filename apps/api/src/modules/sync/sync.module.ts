import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { IdentityModule } from '../identity/identity.module';
import { FilesModule } from '../files/files.module';
import { SyncPolicyModule } from './sync.registry';
import { SyncService } from './sync.service';
import { SyncFiles } from './sync.files';
import { SyncController, SyncAttachmentsController } from './sync.controller';
import { SYNC_POOL } from './sync.tokens';
@Module({
 imports:[SyncPolicyModule,IdentityModule,FilesModule],controllers:[SyncController,SyncAttachmentsController],
 providers:[{provide:SYNC_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL})},SyncService,SyncFiles],exports:[SyncService,SyncPolicyModule],
})
export class SyncModule {}
