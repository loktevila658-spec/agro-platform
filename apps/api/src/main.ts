import 'reflect-metadata';

import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';

import {
  ObservabilityMetrics,
  StructuredLogger,
  createRequestObservabilityMiddleware,
} from '../../../packages/observability/src/index.cjs';
import { AppModule } from './app.module';
import { ObservabilityExceptionFilter } from './observability-exception.filter';

const { installBaselineSecurityHeaders } = require('../../../security/headers.cjs') as {
  installBaselineSecurityHeaders: (
    application: unknown,
    environment?: NodeJS.ProcessEnv,
  ) => void;
};

export async function createApp(module: Type<unknown> = AppModule): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(module, { logger: false });
  app.useBodyParser('json', { limit: '1mb' });
  installBaselineSecurityHeaders(app.getHttpAdapter().getInstance(), process.env);
  app.use(
    createRequestObservabilityMiddleware(
      app.get(StructuredLogger),
      app.get(ObservabilityMetrics),
    ),
  );
  app.useGlobalFilters(new ObservabilityExceptionFilter(app.get(StructuredLogger)));
  return app;
}

export async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  app.get(StructuredLogger).info('api.server.started', 'API server started', { port });
}

if (require.main === module) {
  void bootstrap();
}
