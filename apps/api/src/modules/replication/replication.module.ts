import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ReplicationRegistry } from './replication.registry';
import { ReplicationService } from './replication.service';
import { ReplicationConsumer } from './replication.consumer';
import { REPLICATION_POOL } from './replication.types';
@Module({imports:[IntegrationsModule],providers:[
  {provide:REPLICATION_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},
  ReplicationRegistry,ReplicationService,ReplicationConsumer,
],exports:[ReplicationRegistry,ReplicationService,ReplicationConsumer]})
export class ReplicationModule {}
