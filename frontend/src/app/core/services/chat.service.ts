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
}

export interface ChatResponse {
  answer: string;
  chunks: RagChunk[];
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  sendQuery(query: string, environmentName?: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${environment.apiUrl}/chat`, {
      query,
      environment: environmentName,
    });
  }
}
