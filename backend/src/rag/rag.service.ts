import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface RagChunk {
  id: string;
  content: string;
  source_type: string;
  metadata: Record<string, unknown>;
  score?: number;
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

  async query(query: string, environment?: string): Promise<RagQueryResult> {
    const { data } = await firstValueFrom(
      this.http.post<RagQueryResult>(`${this.baseUrl}/query`, {
        query,
        environment,
      }),
    );
    return data;
  }

  async health(): Promise<{ status: string; database: string }> {
    const { data } = await firstValueFrom(
      this.http.get<{ status: string; database: string }>(
        `${this.baseUrl}/health`,
      ),
    );
    return data;
  }
}
