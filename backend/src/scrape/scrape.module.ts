import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';
import { ScrapeStorageService } from './scrape-storage.service';

@Module({
  imports: [IngestModule],
  controllers: [ScrapeController],
  providers: [ScrapeService, ScrapeStorageService],
  exports: [ScrapeService],
})
export class ScrapeModule {}
