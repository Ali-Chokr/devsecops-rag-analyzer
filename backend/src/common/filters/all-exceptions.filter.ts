import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  code?: string;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.normalize(exception, request.url);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private normalize(exception: unknown, path: string): { status: number; body: ErrorBody } {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const normalized = this.fromHttpResponse(response, status, path, timestamp);
      return { status, body: normalized };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        timestamp,
        path,
      },
    };
  }

  private fromHttpResponse(
    response: string | object,
    status: number,
    path: string,
    timestamp: string,
  ): ErrorBody {
    if (typeof response === 'string') {
      return {
        statusCode: status,
        message: response,
        error: HttpStatus[status] ?? 'Error',
        timestamp,
        path,
      };
    }

    const payload = response as Record<string, unknown>;
    const message = payload.message ?? 'Request failed';
    const code = typeof payload.code === 'string' ? payload.code : undefined;

    return {
      statusCode: status,
      message: message as string | string[],
      error:
        typeof payload.error === 'string'
          ? payload.error
          : (HttpStatus[status] ?? 'Error'),
      code,
      timestamp,
      path,
    };
  }
}
