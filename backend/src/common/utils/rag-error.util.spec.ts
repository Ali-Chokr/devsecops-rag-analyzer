import {
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import { mapRagEngineError } from './rag-error.util';

describe('mapRagEngineError', () => {
  it('maps connection refused to service unavailable', () => {
    const error = new AxiosError('connect refused', 'ECONNREFUSED');
    const mapped = mapRagEngineError(error);
    expect(mapped).toBeInstanceOf(ServiceUnavailableException);
    expect(mapped.getResponse()).toMatchObject({ code: 'RAG_UNREACHABLE' });
  });

  it('maps timeout to gateway timeout', () => {
    const error = new AxiosError('timeout', 'ECONNABORTED');
    const mapped = mapRagEngineError(error);
    expect(mapped).toBeInstanceOf(GatewayTimeoutException);
    expect(mapped.getResponse()).toMatchObject({ code: 'RAG_TIMEOUT' });
  });

  it('maps upstream HTTP errors', () => {
    const error = new AxiosError('bad request', undefined, undefined, undefined, {
      status: 422,
      statusText: 'Unprocessable Entity',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { detail: 'invalid query' },
    });
    const mapped = mapRagEngineError(error);
    expect(mapped).toBeInstanceOf(HttpException);
    expect(mapped.getStatus()).toBe(422);
    expect(mapped.getResponse()).toMatchObject({
      code: 'RAG_ERROR',
      message: 'invalid query',
    });
  });
});
