import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { IntegrationsRegistry } from './integrations.registry';
import { IntegrationsService, INTEGRATIONS_POOL } from './integrations.service';
@Module({
 providers:[{provide:INTEGRATIONS_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL})},IntegrationsRegistry,IntegrationsService],
 exports:[IntegrationsRegistry,IntegrationsService],
})
export class IntegrationsModule {}
