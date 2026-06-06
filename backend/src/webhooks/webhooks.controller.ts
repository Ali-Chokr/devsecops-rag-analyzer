import {
  Body,
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Post,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { GitLabWebhookDto } from '../common/dto/gitlab-webhook.dto';
import { EventsService } from '../events/events.service';
import { IngestService } from '../ingest/ingest.service';
import { WebhooksService } from './webhooks.service';

/**
 * GitLab CI/CD webhook receiver (Phase 1).
 * Configure in GitLab: Settings → Webhooks → URL: POST /api/webhooks/gitlab
 */
@Public()
@Controller('api/webhooks')
export class WebhooksController {
  constructor(
    private readonly config: ConfigService,
    private readonly webhooks: WebhooksService,
    private readonly ingest: IngestService,
    private readonly events: EventsService,
  ) {}

  @Post('gitlab')
  @HttpCode(202)
  @UsePipes(
    new ValidationPipe({
      whitelist: false,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  async receiveGitLab(
    @Body() payload: GitLabWebhookDto,
    @Headers('x-gitlab-token') token?: string,
  ) {
    const secret = this.config.get<string>('GITLAB_WEBHOOK_SECRET');
    if (secret && token !== secret) {
      throw new UnauthorizedException({
        message: 'Invalid GitLab webhook token',
        code: 'WEBHOOK_UNAUTHORIZED',
      });
    }

    const meta = {
      source: 'gitlab',
      object_kind: payload.object_kind,
    } as Record<string, unknown>;
    const saved = await this.webhooks.saveRawPayload(payload, meta);

    if (!saved.ok) {
      throw new InternalServerErrorException({
        message: 'Failed to persist webhook payload',
        code: 'WEBHOOK_SAVE_FAILED',
        detail: saved.error,
      });
    }

    const job = {
      source: 'gitlab',
      object_kind: payload.object_kind,
      raw_file: saved.file,
      raw_id: saved.id,
    };
    const enq = await this.ingest.enqueue(job);

    if (!enq.ok) {
      throw new InternalServerErrorException({
        message: 'Failed to enqueue ingestion job',
        code: 'WEBHOOK_ENQUEUE_FAILED',
        detail: enq.error,
      });
    }

    this.events.emit(
      'gitlab.webhook.received',
      `GitLab ${payload.object_kind ?? 'event'} received`,
      {
        object_kind: payload.object_kind,
        webhook_id: saved.id,
        job_id: enq.db_id ?? enq.id,
      },
    );

    return {
      accepted: true,
      webhook_id: saved.id,
      webhook_file: saved.file,
      job_id: enq.id,
      db_id: enq.db_id,
      job_file: enq.file,
      object_kind: payload.object_kind,
      message: 'Webhook saved and ingestion job enqueued',
    };
  }
}
