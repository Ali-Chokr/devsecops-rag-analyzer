import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventsService } from '../events/events.service';
import { IngestService } from '../ingest/ingest.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let configService: Partial<ConfigService>;
  let webhooksService: Partial<WebhooksService>;
  let ingestService: Partial<IngestService>;
  let eventsService: Partial<EventsService>;

  beforeEach(async () => {
    configService = { get: jest.fn() };
    webhooksService = { saveRawPayload: jest.fn() };
    ingestService = { enqueue: jest.fn() };
    eventsService = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: WebhooksService, useValue: webhooksService },
        { provide: IngestService, useValue: ingestService },
        { provide: EventsService, useValue: eventsService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('rejects requests with invalid token when secret set', async () => {
    (configService.get as jest.Mock).mockReturnValue('expected-secret');

    await expect(
      controller.receiveGitLab({ object_kind: 'pipeline' }, 'bad-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when saving payload fails', async () => {
    (configService.get as jest.Mock).mockReturnValue('secret');
    (webhooksService.saveRawPayload as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'disk',
    });

    await expect(
      controller.receiveGitLab({ object_kind: 'pipeline' }, 'secret'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('throws when enqueue fails', async () => {
    (configService.get as jest.Mock).mockReturnValue('secret');
    (webhooksService.saveRawPayload as jest.Mock).mockResolvedValue({
      ok: true,
      id: 'w1',
      file: '/tmp/w1.json',
    });
    (ingestService.enqueue as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'queue error',
    });

    await expect(
      controller.receiveGitLab({ object_kind: 'pipeline' }, 'secret'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('saves payload and enqueues job on success', async () => {
    (configService.get as jest.Mock).mockReturnValue('secret');
    (webhooksService.saveRawPayload as jest.Mock).mockResolvedValue({
      ok: true,
      id: 'w1',
      file: '/tmp/w1.json',
    });
    (ingestService.enqueue as jest.Mock).mockResolvedValue({
      ok: true,
      id: 'j1',
      file: '/tmp/j1.json',
    });

    const res = await controller.receiveGitLab(
      { object_kind: 'pipeline' },
      'secret',
    );
    expect(res).toMatchObject({ accepted: true, webhook_id: 'w1', job_id: 'j1' });
  });
});
