import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RagChunk {
  id: string;
  content: string;
  source_type: string;
  metadata: Record<string, unknown>;
  score?: number;
  environment?: string;
  service_name?: string;
}

export interface ChatResponse {
  answer: string;
  chunks: RagChunk[];
}

export interface ChatMessagePayload {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChatHandlers {
  onChunks: (chunks: RagChunk[]) => void;
  onToken: (token: string) => void;
  onDone: (answer: string) => void;
  onError: (message: string) => void;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  private authHeaders(): Record<string, string> | undefined {
    return environment.apiKey ? { 'X-API-Key': environment.apiKey } : undefined;
  }

  sendQuery(
    query: string,
    environmentName?: string,
    sourceTypes?: string[],
    messages?: ChatMessagePayload[],
  ): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(
      `${environment.apiUrl}/chat`,
      {
        query,
        environment: environmentName,
        source_types: sourceTypes,
        messages,
      },
      { headers: this.authHeaders() },
    );
  }

  async streamQuery(
    query: string,
    handlers: StreamChatHandlers,
    environmentName?: string,
    sourceTypes?: string[],
    signal?: AbortSignal,
    messages?: ChatMessagePayload[],
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(this.authHeaders() ?? {}),
    };

    const response = await fetch(`${environment.apiUrl}/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        environment: environmentName,
        source_types: sourceTypes,
        messages,
      }),
      signal,
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const payload = await response.json();
        message =
          (typeof payload.message === 'string' && payload.message) ||
          (Array.isArray(payload.message) ? payload.message.join(', ') : message);
      } catch {
        // ignore parse errors
      }
      handlers.onError(message);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      handlers.onError('Streaming is not supported in this browser');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const rawEvent of events) {
        this.dispatchEvent(rawEvent, handlers);
      }
    }

    if (buffer.trim()) {
      this.dispatchEvent(buffer, handlers);
    }
  }

  private dispatchEvent(rawEvent: string, handlers: StreamChatHandlers): void {
    const dataLines = rawEvent
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());

    if (dataLines.length === 0) {
      return;
    }

    try {
      const payload = JSON.parse(dataLines.join('\n')) as {
        type: string;
        chunks?: RagChunk[];
        content?: string;
        answer?: string;
        message?: string;
      };

      switch (payload.type) {
        case 'chunks':
          handlers.onChunks(payload.chunks ?? []);
          break;
        case 'token':
          if (payload.content) {
            handlers.onToken(payload.content);
          }
          break;
        case 'done':
          handlers.onDone(payload.answer ?? '');
          break;
        case 'error':
          handlers.onError(payload.message ?? 'Stream failed');
          break;
      }
    } catch {
      handlers.onError('Failed to parse streaming response');
    }
  }
}
