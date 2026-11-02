import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { FilesModule } from '../files/files.module';
import { GisRegistry } from './gis.registry';
import { GisService,GIS_POOL } from './gis.service';
import { GisParser } from './gis.parser';
import { GisImportsService } from './gis-imports.service';
@Module({
 imports:[FilesModule],
 providers:[{provide:GIS_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},GisRegistry,GisService,GisParser,GisImportsService],
 exports:[GisRegistry,GisService,GisImportsService],
})
export class GisModule {}
