import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { EventsService } from '../../core/services/events.service';

@Component({
  selector: 'app-incident-feed',
  imports: [DatePipe],
  template: `
    <section class="incident-feed">
      <h2>Live incident feed</h2>
      @if (events.events().length === 0) {
        <p class="empty">Waiting for webhooks, logs, and ingest events…</p>
      } @else {
        <ul>
          @for (event of events.events(); track event.timestamp + event.type) {
            <li [class]="eventClass(event.type)">
              <time>{{ event.timestamp | date: 'short' }}</time>
              <span class="type">{{ event.type }}</span>
              <span class="message">{{ event.message }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .incident-feed {
      background: #1a1d23;
      color: #e8eaed;
      border-radius: 12px;
      padding: 1.25rem;
      max-height: 320px;
      overflow-y: auto;
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
    }
    .empty {
      color: #9aa0a6;
      font-size: 0.875rem;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    li {
      display: grid;
      grid-template-columns: auto auto 1fr;
      gap: 0.5rem;
      font-size: 0.8rem;
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      background: #0f1114;
    }
    time {
      color: #9aa0a6;
      white-space: nowrap;
    }
    .type {
      color: #60a5fa;
      font-family: monospace;
    }
    li.error .type {
      color: #f87171;
    }
    li.success .type {
      color: #4ade80;
    }
  `,
})
export class IncidentFeedComponent implements OnInit {
  readonly events = inject(EventsService);

  ngOnInit(): void {
    this.events.connect();
  }

  eventClass(type: string): string {
    if (type.includes('failed') || type.includes('error')) {
      return 'error';
    }
    if (type.includes('completed')) {
      return 'success';
    }
    return '';
  }
}
