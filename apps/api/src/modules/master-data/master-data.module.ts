import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MasterDataRegistry } from './master-data.registry';
import { MasterDataService, MASTER_DATA_POOL } from './master-data.service';
@Module({
  imports:[IntegrationsModule],
  providers:[{provide:MASTER_DATA_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},MasterDataRegistry,MasterDataService],
  exports:[MasterDataRegistry,MasterDataService],
})
export class MasterDataModule {}
