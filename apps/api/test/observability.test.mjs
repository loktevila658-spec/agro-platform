import assert from 'node:assert/strict';
import { Module } from '@nestjs/common';
import test from 'node:test';

import {
  ObservabilityMetrics,
  StructuredLogger,
} from '../../../packages/observability/src/index.cjs';
import { createApp } from '../dist/main.js';
import { ObservabilityController } from '../dist/observability.controller.js';
import { SchemaVersionService } from '../dist/schema-version.service.js';

test('real HTTP lifecycle propagates supplied and generated correlation ids, logs safely, and measures requests', async (t) => {
  const savedDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const logLines = [];
  const app = await createApp();
  app.get(StructuredLogger).sink = (line) => logLines.push(line);
  let readyApp;
  t.after(async () => {
    if (readyApp) await readyApp.close();
    await app.close();
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
  });

  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const supplied = await fetch(`${baseUrl}/health/live`, {
    headers: { 'x-correlation-id': 'client-request-42' },
  });
  assert.equal(supplied.status, 200);
  assert.equal(supplied.headers.get('x-correlation-id'), 'client-request-42');
  assert.deepEqual(await supplied.json(), { status: 'ok' });

  const generated = await fetch(`${baseUrl}/health/live`, {
    headers: { 'x-correlation-id': 'x'.repeat(129) },
  });
  assert.equal(generated.status, 200);
  const generatedCorrelationId = generated.headers.get('x-correlation-id') ?? '';
  assert.match(generatedCorrelationId, /^[0-9a-f-]{36}$/i);

  const ready = await fetch(`${baseUrl}/health/ready`);
  assert.equal(ready.status, 503);
  const readinessCorrelationId = ready.headers.get('x-correlation-id');
  assert.match(readinessCorrelationId ?? '', /^[0-9a-f-]{36}$/i);
  assert.deepEqual(await ready.json(), {
    status: 'not_ready',
    databaseStatus: 'unavailable',
  });

  class ReadyTestModule {}
  Module({
    controllers: [ObservabilityController],
    providers: [
      {
        provide: SchemaVersionService,
        useValue: {
          read: async () => ({
            schemaVersion: 1,
            expectedSchemaVersion: 1,
            postgisVersion: '3.5.2',
            status: 'current',
          }),
        },
      },
      { provide: StructuredLogger, useFactory: () => new StructuredLogger() },
      { provide: ObservabilityMetrics, useFactory: () => new ObservabilityMetrics() },
    ],
  })(ReadyTestModule);
  readyApp = await createApp(ReadyTestModule);
  readyApp.get(StructuredLogger).sink = (line) => logLines.push(line);
  await readyApp.listen(0, '127.0.0.1');
  const readyAddress = readyApp.getHttpServer().address();
  assert.ok(readyAddress && typeof readyAddress === 'object');
  const readySuccess = await fetch(`http://127.0.0.1:${readyAddress.port}/health/ready`);
  assert.equal(readySuccess.status, 200);
  assert.deepEqual(await readySuccess.json(), {
    status: 'ready',
    databaseStatus: 'current',
  });

  const missing = await fetch(`${baseUrl}/not-a-route?password=do-not-log`, {
    headers: {
      authorization: 'Bearer do-not-log-token',
      cookie: 'session=do-not-log-cookie',
    },
  });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/i);

  const metricsResponse = await fetch(`${baseUrl}/metrics`);
  assert.equal(metricsResponse.status, 200);
  const metrics = await metricsResponse.json();
  assert.deepEqual(Object.keys(metrics).sort(), [
    'httpRequestCount',
    'httpRequestDurationMsTotal',
    'httpStatus2xxCount',
    'httpStatus3xxCount',
    'httpStatus4xxCount',
    'httpStatus5xxCount',
    'processHeapUsedBytes',
    'processResidentSetBytes',
    'processUptimeSeconds',
  ].sort());
  assert.ok(metrics.processUptimeSeconds > 0);
  assert.ok(metrics.httpRequestCount >= 4);
  assert.ok(metrics.httpRequestDurationMsTotal >= 0);
  assert.ok(metrics.httpStatus2xxCount >= 2);
  assert.ok(metrics.httpStatus4xxCount >= 1);
  assert.ok(metrics.httpStatus5xxCount >= 1);

  const schemaVersion = await fetch(`${baseUrl}/system/schema-version`);
  assert.equal(schemaVersion.status, 503);
  assert.equal(schemaVersion.headers.get('x-correlation-id')?.length, 36);
  assert.deepEqual(await schemaVersion.json(), {
    statusCode: 503,
    error: 'Service Unavailable',
    message: 'Database schema version is unavailable',
  });

  const records = logLines.map((line) => JSON.parse(line));
  const requestLogs = records.filter((record) => record.event === 'http.request');
  const errorLogs = records.filter((record) => record.event === 'http.error');
  assert.ok(
    requestLogs.some((record) => record.correlationId === 'client-request-42'),
    JSON.stringify(records),
  );
  assert.ok(requestLogs.some((record) => record.correlationId === generatedCorrelationId));
  assert.ok(records.some((record) =>
    record.event === 'health.readiness.not_ready'
      && record.correlationId === readinessCorrelationId));
  assert.ok(requestLogs.every((record) => Number.isFinite(record.durationMs)));
  assert.ok(errorLogs.some((record) => record.statusCode === 503));
  assert.doesNotMatch(logLines.join(''), /do-not-log|do-not-log-token|do-not-log-cookie/);
});
