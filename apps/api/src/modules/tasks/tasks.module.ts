import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { FarmModule } from '../farm/farm.module';
import { SyncModule } from '../sync/sync.module';
import { TasksController } from './tasks.controller';
import { TasksRegistry } from './tasks.registry';
import { TasksService, TASKS_POOL } from './tasks.service';
import { TasksSync } from './tasks.sync';
@Module({imports:[FarmModule,SyncModule],controllers:[TasksController],providers:[{provide:TASKS_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},TasksRegistry,TasksService,TasksSync],exports:[TasksRegistry,TasksService]})
export class TasksModule {}
