import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ScrapeRequestDto } from '../common/dto/scrape.dto';
import { ScrapeService } from './scrape.service';

@Controller('api/ingest/scrape')
export class ScrapeController {
  constructor(private readonly scrape: ScrapeService) {}

  @Post('k8s')
  @HttpCode(202)
  scrapeK8s(@Body() body: ScrapeRequestDto) {
    return this.scrape.scrapeK8s(body);
  }

  @Post('ansible')
  @HttpCode(202)
  scrapeAnsible(@Body() body: ScrapeRequestDto) {
    return this.scrape.scrapeAnsible(body);
  }

  @Post('terraform')
  @HttpCode(202)
  scrapeTerraform(@Body() body: ScrapeRequestDto) {
    return this.scrape.scrapeTerraform(body);
  }
}
