import {OfflineGisModule} from './modules/offline-gis/offline-gis.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { FarmModule } from './modules/farm/farm.module';
import { LandModule } from './modules/land/land.module';
import { GisModule } from './modules/gis/gis.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { ReplicationModule } from './modules/replication/replication.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { OneCModule } from './modules/integrations/1c/one-c.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { SyncModule } from './modules/sync/sync.module';
import { Module } from '@nestjs/common';

import { ObservabilityMetrics, StructuredLogger } from '../../../packages/observability/src/index.cjs';
import { ObservabilityController } from './observability.controller';
import { SchemaVersionController } from './schema-version.controller';
import { SchemaVersionService } from './schema-version.service';
import { OrgModule } from './modules/org/org.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AuditModule } from './modules/audit/audit.module';
import { EventsModule } from './modules/events/events.module';
import { FilesModule } from './modules/files/files.module';

@Module({
  imports: [OfflineGisModule,TasksModule,FarmModule, LandModule, GisModule, MasterDataModule, ReplicationModule, ProvidersModule, OneCModule, IntegrationsModule, OrgModule, IdentityModule, AuditModule, EventsModule, FilesModule, SyncModule],
  controllers: [SchemaVersionController, ObservabilityController],
  providers: [
    SchemaVersionService,
    { provide: StructuredLogger, useFactory: () => new StructuredLogger() },
    { provide: ObservabilityMetrics, useFactory: () => new ObservabilityMetrics() },
  ],
})
export class AppModule {}
