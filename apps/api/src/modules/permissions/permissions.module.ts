import { Module } from '@nestjs/common';

import { PermissionEngine } from './permission-engine';

@Module({
  providers: [PermissionEngine],
  exports: [PermissionEngine],
})
export class PermissionsModule {}
