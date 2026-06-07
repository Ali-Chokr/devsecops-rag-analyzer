import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

interface IngestJob {
  id: string;
  source_type: string;
  status: string;
  created_at: string;
  error_message?: string | null;
}

@Component({
  selector: 'app-jobs',
  imports: [DatePipe, RouterLink],
  template: `
    <section class="jobs-page">
      <header>
        <h1>Ingestion jobs</h1>
        <a routerLink="/">Back to dashboard</a>
      </header>
      <div class="toolbar">
        <label>
          Status
          <select (change)="onStatusChange($event)">
            <option value="">All</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <button type="button" (click)="refresh()">Refresh</button>
      </div>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
      @if (jobs().length === 0) {
        <p class="empty">No ingestion jobs found.</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Source</th>
              <th>Status</th>
              <th>Created</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            @for (job of jobs(); track job.id) {
              <tr>
                <td class="mono">{{ job.id }}</td>
                <td>{{ job.source_type }}</td>
                <td [class]="job.status">{{ job.status }}</td>
                <td>{{ job.created_at | date: 'short' }}</td>
                <td>{{ job.error_message || '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: `
    .jobs-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2rem;
      font-family: system-ui, sans-serif;
      color: #e8eaed;
      background: #0f1114;
      min-height: 100vh;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    a {
      color: #60a5fa;
    }
    .toolbar {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    select,
    button {
      margin-left: 0.5rem;
      padding: 0.4rem 0.6rem;
      border-radius: 6px;
      border: 1px solid #3c4048;
      background: #1a1d23;
      color: inherit;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1a1d23;
      border-radius: 12px;
      overflow: hidden;
    }
    th,
    td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #2a2f38;
      font-size: 0.875rem;
    }
    .mono {
      font-family: monospace;
      font-size: 0.75rem;
    }
    .failed {
      color: #f87171;
    }
    .completed {
      color: #4ade80;
    }
    .empty,
    .error {
      color: #9aa0a6;
    }
    .error {
      color: #f87171;
    }
  `,
})
export class JobsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly jobs = signal<IngestJob[]>([]);
  readonly error = signal<string | null>(null);
  private statusFilter = '';

  ngOnInit(): void {
    this.refresh();
  }

  onStatusChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.statusFilter = target.value;
    this.refresh();
  }

  refresh(): void {
    const params = this.statusFilter ? `?status=${this.statusFilter}` : '';
    const headers = environment.apiKey
      ? { 'X-API-Key': environment.apiKey }
      : undefined;
    this.http
      .get<{ jobs: IngestJob[] }>(`${environment.apiUrl}/ingest/jobs${params}`, {
        headers,
      })
      .subscribe({
        next: (response) => {
          this.jobs.set(response.jobs);
          this.error.set(null);
        },
        error: (err: Error) => this.error.set(err.message ?? 'Failed to load jobs'),
      });
  }
}
