import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { GisModule } from '../gis/gis.module';
import { LandRegistry } from './land.registry';
import { LAND_POOL, LandService } from './land.service';
@Module({
 imports:[GisModule],
 providers:[{provide:LAND_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},LandRegistry,LandService],
 exports:[LandRegistry,LandService],
})
export class LandModule {}
