import { Module } from '@nestjs/common';
import { ArchiveModule } from '../archive/archive.module';
import { EventsModule } from '../events/events.module';
import { RagModule } from '../rag/rag.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { LogsService } from './logs.service';

@Module({
  imports: [EventsModule, ArchiveModule, RagModule],
  controllers: [IngestController],
  providers: [IngestService, LogsService],
  exports: [IngestService, LogsService],
})
export class IngestModule {}
