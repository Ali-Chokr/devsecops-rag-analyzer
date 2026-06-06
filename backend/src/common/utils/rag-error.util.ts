import {
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AxiosError } from 'axios';

export function mapRagEngineError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  if (error instanceof AxiosError) {
    if (isUnreachable(error)) {
      return new ServiceUnavailableException({
        message: 'RAG engine is unreachable',
        code: 'RAG_UNREACHABLE',
      });
    }

    if (isTimeout(error)) {
      return new GatewayTimeoutException({
        message: 'RAG engine request timed out',
        code: 'RAG_TIMEOUT',
      });
    }

    if (error.response) {
      const detail = error.response.data;
      const message =
        typeof detail === 'object' &&
        detail !== null &&
        'detail' in detail &&
        typeof (detail as { detail: unknown }).detail === 'string'
          ? (detail as { detail: string }).detail
          : 'RAG engine returned an error';

      return new HttpException(
        {
          message,
          code: 'RAG_ERROR',
          detail,
        },
        error.response.status,
      );
    }
  }

  return new InternalServerErrorException({
    message: 'Unexpected error communicating with RAG engine',
    code: 'RAG_UNKNOWN',
  });
}

function isUnreachable(error: AxiosError): boolean {
  return (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ECONNRESET' ||
    error.code === 'EAI_AGAIN'
  );
}

function isTimeout(error: AxiosError): boolean {
  return error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout');
}
