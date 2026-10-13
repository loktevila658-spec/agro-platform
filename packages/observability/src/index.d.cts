import type { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  readonly correlationId: string;
}

export interface StructuredLoggerOptions {
  readonly service?: string;
  readonly sink?: (line: string) => void;
}

export interface MetricsSnapshot {
  readonly processUptimeSeconds: number;
  readonly processHeapUsedBytes: number;
  readonly processResidentSetBytes: number;
  readonly httpRequestCount: number;
  readonly httpRequestDurationMsTotal: number;
  readonly httpStatus2xxCount: number;
  readonly httpStatus3xxCount: number;
  readonly httpStatus4xxCount: number;
  readonly httpStatus5xxCount: number;
}

export class StructuredLogger {
  constructor(options?: StructuredLoggerOptions);
  info(event: string, message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(event: string, message: string, fields?: Readonly<Record<string, unknown>>): void;
  write(level: 'info' | 'warn' | 'error', event: string, message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export class ObservabilityMetrics {
  recordRequest(statusCode: number, durationMs: number): void;
  snapshot(): MetricsSnapshot;
}

export const correlationContext: AsyncLocalStorage<CorrelationContext>;
export function createRequestObservabilityMiddleware(
  logger: StructuredLogger,
  metrics: ObservabilityMetrics,
): (request: any, response: any, next: (error?: unknown) => void) => void;
export function resolveCorrelationId(value: unknown): string;
