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
  imports: [IntegrationsModule, OrgModule, IdentityModule, AuditModule, EventsModule, FilesModule, SyncModule],
  controllers: [SchemaVersionController, ObservabilityController],
  providers: [
    SchemaVersionService,
    { provide: StructuredLogger, useFactory: () => new StructuredLogger() },
    { provide: ObservabilityMetrics, useFactory: () => new ObservabilityMetrics() },
  ],
})
export class AppModule {}
