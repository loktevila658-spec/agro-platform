import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { StructuredLogger } from '../../../packages/observability/src/index.cjs';

interface HttpRequest {
  readonly correlationId?: string;
  readonly method: string;
  readonly path: string;
}

interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): HttpResponse;
}

@Catch()
export class ObservabilityExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const statusCode = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error('http.error', 'HTTP request failed', {
      correlationId: request.correlationId,
      method: request.method,
      route: request.path,
      statusCode,
      errorType: exception instanceof Error ? exception.name : 'UnknownError',
    });

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response.status(statusCode).json(
        typeof body === 'string'
          ? { statusCode, message: body }
          : body,
      );
      return;
    }

    response.status(statusCode).json({
      statusCode,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  }
}
