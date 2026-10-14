import { Module } from '@nestjs/common';

import { AUDIT_AUTHORIZATION, FailClosedAuditAuthorization } from './audit.authorization';
import { AuditService } from './audit.service';

@Module({
  providers: [
    { provide: AUDIT_AUTHORIZATION, useClass: FailClosedAuditAuthorization },
    AuditService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
