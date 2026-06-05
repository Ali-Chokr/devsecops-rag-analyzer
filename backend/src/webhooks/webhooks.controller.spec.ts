import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import { IngestService } from '../ingest/ingest.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let configService: Partial<ConfigService>;
  let webhooksService: Partial<WebhooksService>;
  let ingestService: Partial<IngestService>;

  beforeEach(async () => {
    configService = { get: jest.fn() };
    webhooksService = { saveRawPayload: jest.fn() };
    ingestService = { enqueue: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: WebhooksService, useValue: webhooksService },
        { provide: IngestService, useValue: ingestService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('rejects requests with invalid token when secret set', async () => {
    (configService.get as jest.Mock).mockReturnValue('expected-secret');
    const res = await controller.receiveGitLab({ object_kind: 'pipeline' }, 'bad-token');
    expect(res).toEqual({ accepted: false, reason: 'invalid token' });
  });

  it('returns save_failed when saving payload fails', async () => {
    (configService.get as jest.Mock).mockReturnValue('secret');
    (webhooksService.saveRawPayload as jest.Mock).mockResolvedValue({ ok: false, error: 'disk' });

    const res = await controller.receiveGitLab({ object_kind: 'pipeline' }, 'secret');
    expect(res).toMatchObject({ accepted: false, reason: 'save_failed' });
  });

  it('returns enqueue_failed when enqueue fails', async () => {
    (configService.get as jest.Mock).mockReturnValue('secret');
    (webhooksService.saveRawPayload as jest.Mock).mockResolvedValue({ ok: true, id: 'w1', file: '/tmp/w1.json' });
    (ingestService.enqueue as jest.Mock).mockResolvedValue({ ok: false, error: 'queue error' });

    const res = await controller.receiveGitLab({ object_kind: 'pipeline' }, 'secret');
    expect(res).toMatchObject({ accepted: false, reason: 'enqueue_failed' });
  });

  it('saves payload and enqueues job on success', async () => {
    (configService.get as jest.Mock).mockReturnValue('secret');
    (webhooksService.saveRawPayload as jest.Mock).mockResolvedValue({ ok: true, id: 'w1', file: '/tmp/w1.json' });
    (ingestService.enqueue as jest.Mock).mockResolvedValue({ ok: true, id: 'j1', file: '/tmp/j1.json' });

    const res = await controller.receiveGitLab({ object_kind: 'pipeline' }, 'secret');
    expect(res).toMatchObject({ accepted: true, webhook_id: 'w1', job_id: 'j1' });
  });
});
