import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { IngestService } from '../ingest/ingest.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, IngestService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
