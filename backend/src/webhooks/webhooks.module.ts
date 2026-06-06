import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { IngestModule } from '../ingest/ingest.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [IngestModule, EventsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
