import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { IntegrationsModule } from '../integrations.module';
import { OneCService, ONE_C_POOL } from './one-c.service';
@Module({imports:[IntegrationsModule],providers:[
 {provide:ONE_C_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,statement_timeout:5000})},OneCService,
],exports:[OneCService]})
export class OneCModule {}
