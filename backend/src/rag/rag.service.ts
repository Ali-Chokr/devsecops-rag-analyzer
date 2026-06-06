import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { mapRagEngineError } from '../common/utils/rag-error.util';

export interface RagChunk {
  id: string;
  content: string;
  source_type: string;
  metadata: Record<string, unknown>;
  score?: number;
  environment?: string;
  service_name?: string;
}

export interface RagQueryResult {
  answer: string;
  chunks: RagChunk[];
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl =
      this.config.get<string>('RAG_ENGINE_URL') ?? 'http://localhost:8000';
  }

  async query(
    query: string,
    environment?: string,
    sourceTypes?: string[],
  ): Promise<RagQueryResult> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<RagQueryResult>(`${this.baseUrl}/query`, {
          query,
          environment,
          source_types: sourceTypes,
        }),
      );
      return data;
    } catch (error) {
      this.logger.warn(`RAG query failed: ${String(error)}`);
      throw mapRagEngineError(error);
    }
  }

  streamQuery(
    query: string,
    environment: string | undefined,
    sourceTypes: string[] | undefined,
    res: Response,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http
        .post(
          `${this.baseUrl}/query/stream`,
          {
            query,
            environment,
            source_types: sourceTypes,
          },
          {
            responseType: 'stream',
            headers: { Accept: 'text/event-stream' },
          },
        )
        .subscribe({
          next: (response: AxiosResponse<NodeJS.ReadableStream>) => {
            res.status(200);
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            const stream = response.data;
            stream.on('error', (error: Error) => {
              this.logger.warn(`RAG stream failed: ${error.message}`);
              if (!res.writableEnded) {
                res.write(
                  `data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`,
                );
                res.end();
              }
              reject(mapRagEngineError(error));
            });
            stream.on('end', () => resolve());
            stream.pipe(res);
          },
          error: (error: unknown) => {
            this.logger.warn(`RAG stream failed: ${String(error)}`);
            reject(mapRagEngineError(error));
          },
        });
    });
  }

  async health(): Promise<{ status: string; database: string }> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<{ status: string; database: string }>(
          `${this.baseUrl}/health`,
        ),
      );
      return data;
    } catch (error) {
      this.logger.warn(`RAG health check failed: ${String(error)}`);
      throw mapRagEngineError(error);
    }
  }
}
