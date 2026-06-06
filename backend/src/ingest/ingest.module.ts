import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { LogsService } from './logs.service';

@Module({
  imports: [EventsModule],
  controllers: [IngestController],
  providers: [IngestService, LogsService],
  exports: [IngestService, LogsService],
})
export class IngestModule {}
