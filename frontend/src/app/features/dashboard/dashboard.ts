import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ChatMessagePayload,
  ChatService,
  RagChunk,
} from '../../core/services/chat.service';
import { MarkdownPipe } from '../../core/pipes/markdown.pipe';
import { ContextPanelComponent } from './context-panel.component';
import { IncidentFeedComponent } from './incident-feed.component';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  chunks?: RagChunk[];
}

export type ChatStatus = 'idle' | 'retrieving' | 'writing' | 'complete';

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule,
    RouterLink,
    MarkdownPipe,
    ContextPanelComponent,
    IncidentFeedComponent,
  ],
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
    terraform: true,
    gitlab_ci: true,
    log: true,
  };

  readonly environments = ['', 'production', 'staging', 'dev'];
  readonly sourceOptions = [
    { key: 'k8s', label: 'Kubernetes' },
    { key: 'ansible', label: 'Ansible' },
    { key: 'terraform', label: 'Terraform' },
    { key: 'gitlab_ci', label: 'GitLab CI' },
    { key: 'log', label: 'Runtime logs' },
  ];

  chatStatus = signal<ChatStatus>('idle');
  answer = signal<string | null>(null);
  chunks = signal<RagChunk[]>([]);
  error = signal<string | null>(null);
  messages = signal<ChatMessage[]>([]);
  selectedMessageIndex = signal<number | null>(null);

  ngOnDestroy(): void {
    this.streamAbort?.abort();
  }

  isBusy(): boolean {
    const status = this.chatStatus();
    return status === 'retrieving' || status === 'writing';
  }

  cancelStream(): void {
    this.streamAbort?.abort();
    this.chatStatus.set('idle');
  }

  onIncidentSelected(message: string): void {
    this.query = message;
  }

  selectHistoryMessage(index: number): void {
    const message = this.messages()[index];
    if (!message || message.role !== 'assistant') {
      return;
    }
    this.selectedMessageIndex.set(index);
    if (message.chunks) {
      this.chunks.set(message.chunks);
    }
    this.answer.set(message.content);
  }

  displayedChunks(): RagChunk[] {
    const index = this.selectedMessageIndex();
    if (index !== null) {
      const message = this.messages()[index];
      if (message?.chunks) {
        return message.chunks;
      }
    }
    return this.chunks();
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
    if (!q || this.isBusy()) return;

    this.streamAbort?.abort();
    this.streamAbort = new AbortController();

    const env = this.environment || undefined;
    const sources = this.selectedSourceTypes();

    this.lastSubmittedQuery = q;
    const priorMessages = this.messages();
    this.messages.update((msgs) => [...msgs, { role: 'user', content: q }]);
    this.query = '';

    const historyPayload: ChatMessagePayload[] = priorMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    this.chatStatus.set('retrieving');
    this.error.set(null);
    this.answer.set(null);
    this.chunks.set([]);
    this.selectedMessageIndex.set(null);

    void this.chat
      .streamQuery(
        q,
        {
          onChunks: (chunks) => this.chunks.set(chunks),
          onToken: (token) => {
            this.chatStatus.set('writing');
            this.answer.update((current) => `${current ?? ''}${token}`);
          },
          onDone: (answer) => {
            this.answer.set(answer);
            this.chatStatus.set('complete');
            this.messages.update((msgs) => [
              ...msgs,
              { role: 'assistant', content: answer, chunks: this.chunks() },
            ]);
          },
          onError: (message) => {
            this.error.set(message);
            this.chatStatus.set('idle');
          },
        },
        env,
        sources,
        this.streamAbort.signal,
        historyPayload,
      )
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          this.error.set(err.message ?? 'Request failed');
          this.chatStatus.set('idle');
        }
      });
  }
}
