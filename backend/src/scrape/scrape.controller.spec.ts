import { Test, TestingModule } from '@nestjs/testing';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';

describe('ScrapeController', () => {
  let controller: ScrapeController;
  let scrapeService: Partial<ScrapeService>;

  beforeEach(async () => {
    scrapeService = {
      scrapeK8s: jest.fn().mockResolvedValue({ accepted: true, jobs_enqueued: 2 }),
      scrapeAnsible: jest.fn().mockResolvedValue({ accepted: true, jobs_enqueued: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScrapeController],
      providers: [{ provide: ScrapeService, useValue: scrapeService }],
    }).compile();

    controller = module.get<ScrapeController>(ScrapeController);
  });

  it('delegates k8s scrape requests', async () => {
    const body = { environment: 'staging' };
    const result = await controller.scrapeK8s(body);
    expect(scrapeService.scrapeK8s).toHaveBeenCalledWith(body);
    expect(result).toEqual({ accepted: true, jobs_enqueued: 2 });
  });

  it('delegates ansible scrape requests', async () => {
    const body = { path: '/tmp/ansible' };
    const result = await controller.scrapeAnsible(body);
    expect(scrapeService.scrapeAnsible).toHaveBeenCalledWith(body);
    expect(result).toEqual({ accepted: true, jobs_enqueued: 1 });
  });
});
