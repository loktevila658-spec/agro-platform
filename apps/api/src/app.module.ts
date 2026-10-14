import { Module } from '@nestjs/common';

import { ObservabilityMetrics, StructuredLogger } from '../../../packages/observability/src/index.cjs';
import { ObservabilityController } from './observability.controller';
import { SchemaVersionController } from './schema-version.controller';
import { SchemaVersionService } from './schema-version.service';
import { OrgModule } from './modules/org/org.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [OrgModule, IdentityModule, AuditModule],
  controllers: [SchemaVersionController, ObservabilityController],
  providers: [
    SchemaVersionService,
    { provide: StructuredLogger, useFactory: () => new StructuredLogger() },
    { provide: ObservabilityMetrics, useFactory: () => new ObservabilityMetrics() },
  ],
})
export class AppModule {}
