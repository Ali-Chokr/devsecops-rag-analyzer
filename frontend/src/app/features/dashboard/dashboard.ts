import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService, RagChunk } from '../../core/services/chat.service';

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly chat = inject(ChatService);

  query = '';
  loading = signal(false);
  answer = signal<string | null>(null);
  chunks = signal<RagChunk[]>([]);
  error = signal<string | null>(null);

  submit(): void {
    const q = this.query.trim();
    if (!q || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    this.answer.set(null);
    this.chunks.set([]);

    this.chat.sendQuery(q).subscribe({
      next: (res) => {
        this.answer.set(res.answer);
        this.chunks.set(res.chunks);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Request failed');
        this.loading.set(false);
      },
    });
  }
}
