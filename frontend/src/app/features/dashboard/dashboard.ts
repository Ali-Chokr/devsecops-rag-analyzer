import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService, RagChunk } from '../../core/services/chat.service';
import { ContextPanelComponent } from './context-panel.component';
import { IncidentFeedComponent } from './incident-feed.component';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  chunks?: RagChunk[];
}

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, ContextPanelComponent, IncidentFeedComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnDestroy {
  private readonly chat = inject(ChatService);
  private streamAbort?: AbortController;

  query = '';
  lastSubmittedQuery = '';
  environment = '';
  sourceTypes: Record<string, boolean> = {
    k8s: true,
    ansible: true,
    gitlab_ci: true,
    log: true,
  };

  readonly environments = ['', 'production', 'staging', 'dev'];
  readonly sourceOptions = [
    { key: 'k8s', label: 'Kubernetes' },
    { key: 'ansible', label: 'Ansible' },
    { key: 'gitlab_ci', label: 'GitLab CI' },
    { key: 'log', label: 'Runtime logs' },
  ];

  loading = signal(false);
  streaming = signal(false);
  answer = signal<string | null>(null);
  chunks = signal<RagChunk[]>([]);
  error = signal<string | null>(null);
  messages = signal<ChatMessage[]>([]);

  ngOnDestroy(): void {
    this.streamAbort?.abort();
  }

  cancelStream(): void {
    this.streamAbort?.abort();
    this.loading.set(false);
    this.streaming.set(false);
  }

  selectedSourceTypes(): string[] | undefined {
    const selected = Object.entries(this.sourceTypes)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    if (selected.length === 0 || selected.length === this.sourceOptions.length) {
      return undefined;
    }
    return selected;
  }

  submit(): void {
    const q = this.query.trim();
    if (!q || this.loading()) return;

    this.streamAbort?.abort();
    this.streamAbort = new AbortController();

    const env = this.environment || undefined;
    const sources = this.selectedSourceTypes();

    this.lastSubmittedQuery = q;
    this.messages.update((msgs) => [...msgs, { role: 'user', content: q }]);
    this.query = '';

    this.loading.set(true);
    this.streaming.set(false);
    this.error.set(null);
    this.answer.set(null);
    this.chunks.set([]);

    void this.chat
      .streamQuery(
        q,
        {
          onChunks: (chunks) => this.chunks.set(chunks),
          onToken: (token) => {
            this.streaming.set(true);
            this.answer.update((current) => `${current ?? ''}${token}`);
          },
          onDone: (answer) => {
            this.answer.set(answer);
            this.loading.set(false);
            this.streaming.set(false);
            this.messages.update((msgs) => [
              ...msgs,
              { role: 'assistant', content: answer, chunks: this.chunks() },
            ]);
          },
          onError: (message) => {
            this.error.set(message);
            this.loading.set(false);
            this.streaming.set(false);
          },
        },
        env,
        sources,
        this.streamAbort.signal,
      )
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          this.error.set(err.message ?? 'Request failed');
          this.loading.set(false);
          this.streaming.set(false);
        }
      });
  }
}
