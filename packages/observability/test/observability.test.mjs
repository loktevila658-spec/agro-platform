import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ObservabilityMetrics,
  StructuredLogger,
  correlationContext,
  resolveCorrelationId,
} from '../src/index.cjs';

test('correlation identifiers accept bounded safe values and replace invalid input', () => {
  assert.equal(resolveCorrelationId('req-42.valid'), 'req-42.valid');
  assert.match(resolveCorrelationId(undefined), /^[0-9a-f-]{36}$/i);
  assert.notEqual(resolveCorrelationId('x'.repeat(129)), 'x'.repeat(129));
  assert.notEqual(resolveCorrelationId('bad\r\nheader'), 'bad\r\nheader');
});

test('structured logs have stable fields and redact sensitive values', () => {
  const records = [];
  const logger = new StructuredLogger({ sink: (line) => records.push(JSON.parse(line)) });

  correlationContext.run({ correlationId: 'req-safe-1' }, () => {
    logger.info('http.request', 'HTTP request completed', {
      method: 'GET',
      authorization: 'Bearer top-secret',
      cookie: 'session=top-secret-cookie',
      notes: 'token=top-secret-text',
      safe: 'value',
    });
  });

  assert.equal(records.length, 1);
  assert.deepEqual(
    Object.keys(records[0]).sort(),
    ['correlationId', 'event', 'level', 'message', 'method', 'notes', 'safe', 'service', 'timestamp'].sort(),
  );
  assert.equal(records[0].correlationId, 'req-safe-1');
  assert.equal(records[0].service, 'agroplatform-api');
  assert.equal(records[0].authorization, undefined);
  assert.equal(records[0].cookie, undefined);
  assert.equal(records[0].notes, 'token=[REDACTED]');
  assert.doesNotMatch(JSON.stringify(records[0]), /top-secret/);
  assert.match(records[0].timestamp, /^\d{4}-\d\d-\d\dT/);
});

test('metrics aggregate actual request counts, durations, and status classes', () => {
  const metrics = new ObservabilityMetrics();

  metrics.recordRequest(204, 3.5);
  metrics.recordRequest(503, 12.25);
  const snapshot = metrics.snapshot();

  assert.ok(snapshot.processUptimeSeconds > 0);
  assert.equal(snapshot.httpRequestCount, 2);
  assert.equal(snapshot.httpRequestDurationMsTotal, 15.75);
  assert.equal(snapshot.httpStatus2xxCount, 1);
  assert.equal(snapshot.httpStatus5xxCount, 1);
});
