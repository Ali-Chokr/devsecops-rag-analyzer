import { Test, TestingModule } from '@nestjs/testing';
import { WorkerSecretGuard } from '../common/guards/worker-secret.guard';
import { RagService } from '../rag/rag.service';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { LogsService } from './logs.service';

describe('IngestController', () => {
  let controller: IngestController;
  let ingestService: Partial<IngestService>;
  let logsService: Partial<LogsService>;
  let ragService: Partial<RagService>;

  beforeEach(async () => {
    ingestService = {
      listJobs: jest.fn().mockResolvedValue([]),
      getJob: jest.fn().mockResolvedValue(null),
      updateJobStatus: jest.fn().mockResolvedValue(true),
    };
    logsService = {
      forward: jest.fn().mockResolvedValue({ accepted: true }),
    };
    ragService = {
      ingest: jest.fn().mockResolvedValue({ inserted: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestController],
      providers: [
        { provide: IngestService, useValue: ingestService },
        { provide: LogsService, useValue: logsService },
        { provide: RagService, useValue: ragService },
      ],
    })
      .overrideGuard(WorkerSecretGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IngestController>(IngestController);
  });

  it('forwards logs via LogsService', async () => {
    const res = await controller.forwardLogs({
      content: 'ERROR X-402',
      environment: 'staging',
    });
    expect(logsService.forward).toHaveBeenCalled();
    expect(res).toEqual({ accepted: true });
  });

  it('lists ingestion jobs', async () => {
    const res = await controller.listJobs('queued', '10');
    expect(ingestService.listJobs).toHaveBeenCalledWith('queued', 10);
    expect(res).toEqual({ jobs: [], count: 0 });
  });
});
