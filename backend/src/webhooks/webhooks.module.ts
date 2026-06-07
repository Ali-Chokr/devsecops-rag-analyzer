import { Module } from '@nestjs/common';
import { ArchiveModule } from '../archive/archive.module';
import { EventsModule } from '../events/events.module';
import { IngestModule } from '../ingest/ingest.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [IngestModule, EventsModule, ArchiveModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
