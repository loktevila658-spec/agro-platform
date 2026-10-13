'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|passphrase|secret|token|credential|api[_-]?key/i;
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const SENSITIVE_VALUE_PATTERN = /["']?(password|passphrase|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?[^"'\s,;&}]+["']?/gi;

const correlationContext = new AsyncLocalStorage();

function isValidCorrelationId(value) {
  return typeof value === 'string' && CORRELATION_ID_PATTERN.test(value);
}

function resolveCorrelationId(value) {
  return isValidCorrelationId(value) ? value : randomUUID();
}

function sanitizeString(value) {
  return value
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(SENSITIVE_VALUE_PATTERN, '$1=[REDACTED]')
    .slice(0, 512);
}

function sanitizeValue(value, depth = 0) {
  if (typeof value === 'string') return sanitizeString(value);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (depth >= 4) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 32).map((entry) => sanitizeValue(entry, depth + 1));
  if (typeof value === 'object') {
    const clean = {};
    for (const [key, child] of Object.entries(value).slice(0, 64)) {
      if (!SENSITIVE_KEY_PATTERN.test(key)) clean[key] = sanitizeValue(child, depth + 1);
    }
    return clean;
  }
  return undefined;
}

class StructuredLogger {
  constructor(options = {}) {
    this.service = options.service ?? 'agroplatform-api';
    this.sink = options.sink ?? ((line) => process.stdout.write(`${line}\n`));
  }

  info(event, message, fields = {}) {
    this.write('info', event, message, fields);
  }

  warn(event, message, fields = {}) {
    this.write('warn', event, message, fields);
  }

  error(event, message, fields = {}) {
    this.write('error', event, message, fields);
  }

  write(level, event, message, fields = {}) {
    const cleanFields = sanitizeValue(fields);
    const { correlationId: _untrustedCorrelationId, ...safeFields } =
      cleanFields && typeof cleanFields === 'object' ? cleanFields : {};
    const context = correlationContext.getStore();
    const candidateId = fields.correlationId ?? context?.correlationId;
    const record = {
      ...safeFields,
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      event: sanitizeString(String(event)),
      message: sanitizeString(String(message)),
      ...(isValidCorrelationId(candidateId) ? { correlationId: candidateId } : {}),
    };
    this.sink(JSON.stringify(record));
  }
}

class ObservabilityMetrics {
  constructor() {
    this.requestCount = 0;
    this.requestDurationMsTotal = 0;
    this.statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  }

  recordRequest(statusCode, durationMs) {
    this.requestCount += 1;
    this.requestDurationMsTotal += Math.max(0, durationMs);
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    if (Object.hasOwn(this.statusCounts, statusClass)) this.statusCounts[statusClass] += 1;
  }

  snapshot() {
    const memory = process.memoryUsage();
    return Object.freeze({
      processUptimeSeconds: Number(process.uptime().toFixed(3)),
      processHeapUsedBytes: memory.heapUsed,
      processResidentSetBytes: memory.rss,
      httpRequestCount: this.requestCount,
      httpRequestDurationMsTotal: Number(this.requestDurationMsTotal.toFixed(3)),
      httpStatus2xxCount: this.statusCounts['2xx'],
      httpStatus3xxCount: this.statusCounts['3xx'],
      httpStatus4xxCount: this.statusCounts['4xx'],
      httpStatus5xxCount: this.statusCounts['5xx'],
    });
  }
}

function createRequestObservabilityMiddleware(logger, metrics) {
  return (request, response, next) => {
    const incomingId = request.headers?.['x-correlation-id'];
    const correlationId = resolveCorrelationId(incomingId);
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);
    const startedAt = process.hrtime.bigint();
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const statusCode = response.statusCode;
      const route = typeof request.route?.path === 'string'
        ? `${request.baseUrl ?? ''}${request.route.path}`
        : 'unmatched';
      metrics.recordRequest(statusCode, durationMs);
      correlationContext.run({ correlationId }, () => {
        logger.info('http.request', 'HTTP request completed', {
          correlationId,
          method: request.method,
          route,
          statusCode,
          durationMs: Number(durationMs.toFixed(3)),
        });
      });
    };

    response.once('finish', finish);
    response.once('close', finish);
    correlationContext.run({ correlationId }, next);
  };
}

module.exports = {
  ObservabilityMetrics,
  StructuredLogger,
  correlationContext,
  createRequestObservabilityMiddleware,
  resolveCorrelationId,
};
