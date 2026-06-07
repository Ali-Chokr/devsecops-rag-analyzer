import { Injectable, OnDestroy, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

export interface IncidentEvent {
  type: string;
  message: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class EventsService implements OnDestroy {
  private socket: Socket | null = null;
  readonly events = signal<IncidentEvent[]>([]);
  readonly connected = signal(false);

  connect(): void {
    if (this.socket?.connected) {
      return;
    }
    this.socket = io(environment.wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('incident', (event: IncidentEvent) => {
      this.events.update((current) => [event, ...current].slice(0, 50));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
