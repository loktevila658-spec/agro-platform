import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  SchemaVersionResponse,
  SchemaVersionService,
  SchemaVersionUnavailableError,
} from './schema-version.service';

@Controller('system')
export class SchemaVersionController {
  constructor(private readonly schemaVersionService: SchemaVersionService) {}

  @Get('schema-version')
  async getSchemaVersion(): Promise<SchemaVersionResponse> {
    try {
      return await this.schemaVersionService.read();
    } catch (error) {
      if (error instanceof SchemaVersionUnavailableError) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Database schema version is unavailable',
        });
      }
      throw error;
    }
  }
}
