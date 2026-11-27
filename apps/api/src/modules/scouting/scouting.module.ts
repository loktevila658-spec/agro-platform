import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { FarmModule } from '../farm/farm.module';
import { TasksModule } from '../tasks/tasks.module';
import { SyncModule } from '../sync/sync.module';
import { ScoutingRegistry } from './scouting.registry';
import { ScoutingService, SCOUTING_POOL } from './scouting.service';
import { ScoutingSync } from './scouting.sync';
import { ScoutingController } from './scouting.controller';
@Module({imports:[FarmModule,TasksModule,SyncModule],controllers:[ScoutingController],providers:[{provide:SCOUTING_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},ScoutingRegistry,ScoutingService,ScoutingSync],exports:[ScoutingRegistry,ScoutingService]})
export class ScoutingModule {}
