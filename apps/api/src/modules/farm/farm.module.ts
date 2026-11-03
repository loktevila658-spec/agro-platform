import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { GisModule } from '../gis/gis.module';
import { LandModule } from '../land/land.module';
import { FarmRegistry } from './farm.registry';
import { FARM_POOL, FarmService } from './farm.service';
@Module({
 imports:[GisModule,LandModule],
 providers:[{provide:FARM_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},FarmRegistry,FarmService],
 exports:[FarmRegistry,FarmService],
})
export class FarmModule {}
