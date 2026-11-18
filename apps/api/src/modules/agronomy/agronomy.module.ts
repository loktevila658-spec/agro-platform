import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { IdentityModule } from '../identity/identity.module';
import { FarmModule } from '../farm/farm.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { AgronomyController } from './agronomy.controller';
import { AgronomyRegistry } from './agronomy.registry';
import { AGRONOMY_POOL, AgronomyService } from './agronomy.service';
@Module({imports:[IdentityModule,FarmModule,MasterDataModule],controllers:[AgronomyController],providers:[{provide:AGRONOMY_POOL,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000})},AgronomyRegistry,AgronomyService],exports:[AgronomyRegistry,AgronomyService]})
export class AgronomyModule {}
