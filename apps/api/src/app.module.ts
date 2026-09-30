import { Module } from '@nestjs/common';

import { SchemaVersionController } from './schema-version.controller';
import { SchemaVersionService } from './schema-version.service';

@Module({
  controllers: [SchemaVersionController],
  providers: [SchemaVersionService],
})
export class AppModule {}
