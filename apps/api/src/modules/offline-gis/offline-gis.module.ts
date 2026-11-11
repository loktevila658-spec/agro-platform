import {Module} from '@nestjs/common';
import {Pool} from 'pg';
import {FarmModule} from '../farm/farm.module';
import {GisModule} from '../gis/gis.module';
import {SyncModule} from '../sync/sync.module';
import {OfflineGisRegistry} from './offline-gis.registry';
import {OfflineGisService,OFFLINE_GIS_POOL} from './offline-gis.service';
import {OfflineGisController} from './offline-gis.controller';
import {OfflineGisSync} from './offline-gis.sync';
import {OfflineGisEvents} from './offline-gis.events';
@Module({imports:[FarmModule,GisModule,SyncModule],controllers:[OfflineGisController],providers:[{provide:OFFLINE_GIS_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},OfflineGisRegistry,OfflineGisService,OfflineGisSync,OfflineGisEvents],exports:[OfflineGisEvents,OfflineGisRegistry,OfflineGisService]})
export class OfflineGisModule {}
