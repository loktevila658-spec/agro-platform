import {
  Controller,
  Get,
  HttpStatus,
  Res,
} from '@nestjs/common';

import { ObservabilityMetrics, StructuredLogger } from '../../../packages/observability/src/index.cjs';
import { SchemaVersionService, SchemaVersionUnavailableError } from './schema-version.service';

interface HealthResponse {
  status(code: number): HealthResponse;
  json(body: Readonly<Record<string, string>>): HealthResponse;
}

@Controller()
export class ObservabilityController {
  constructor(
    private readonly schemaVersionService: SchemaVersionService,
    private readonly metrics: ObservabilityMetrics,
    private readonly logger: StructuredLogger,
  ) {}

  @Get('health/live')
  getLiveness(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  async getReadiness(@Res() response: HealthResponse): Promise<void> {
    try {
      const schema = await this.schemaVersionService.read();
      if (schema.status === 'current') {
        response.status(HttpStatus.OK).json({
          status: 'ready',
          databaseStatus: 'current',
        });
        return;
      }

      this.logger.warn('health.readiness.not_ready', 'API readiness check failed', {
        databaseStatus: schema.status,
      });
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'not_ready',
        databaseStatus: schema.status,
      });
    } catch (error) {
      if (!(error instanceof SchemaVersionUnavailableError)) throw error;
      this.logger.warn('health.readiness.not_ready', 'API readiness check failed', {
        databaseStatus: 'unavailable',
      });
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'not_ready',
        databaseStatus: 'unavailable',
      });
    }
  }

  @Get('metrics')
  getMetrics(): ReturnType<ObservabilityMetrics['snapshot']> {
    return this.metrics.snapshot();
  }
}
