import { Injectable } from '@nestjs/common';
import { EventsGateway, IncidentEvent } from './events.gateway';

@Injectable()
export class EventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emit(type: string, message: string, payload?: Record<string, unknown>) {
    const event: IncidentEvent = {
      type,
      message,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.gateway.broadcast(event);
  }
}
