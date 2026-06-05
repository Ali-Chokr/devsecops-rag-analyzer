import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import { IngestService } from '../ingest/ingest.service';

/**
 * GitLab CI/CD webhook receiver (Phase 1).
 * Configure in GitLab: Settings → Webhooks → URL: POST /api/webhooks/gitlab
 */
@Controller('api/webhooks')
export class WebhooksController {
  constructor(
    private readonly config: ConfigService,
    private readonly webhooks: WebhooksService,
    private readonly ingest: IngestService,
  ) {}

  @Post('gitlab')
  @HttpCode(202)
  async receiveGitLab(
    @Body() payload: Record<string, unknown>,
    @Headers('x-gitlab-token') token?: string,
  ) {
    const secret = this.config.get<string>('GITLAB_WEBHOOK_SECRET');
    if (secret && token !== secret) {
      return { accepted: false, reason: 'invalid token' };
    }

    // persist raw payload for later ingestion/processing
    const meta = { source: 'gitlab', object_kind: payload['object_kind'] } as Record<string, unknown>;
    const saved = await this.webhooks.saveRawPayload(payload, meta);

    if (!saved.ok) {
      return { accepted: false, reason: 'save_failed', error: saved.error };
    }
    // enqueue ingestion job pointing to saved raw payload
    const job = { source: 'gitlab', object_kind: payload['object_kind'], raw_file: saved.file, raw_id: saved.id };
    const enq = await this.ingest.enqueue(job);

    if (!enq.ok) {
      return { accepted: false, reason: 'enqueue_failed', error: enq.error };
    }

    return {
      accepted: true,
      webhook_id: saved.id,
      webhook_file: saved.file,
      job_id: enq.id,
      job_file: enq.file,
      object_kind: payload['object_kind'],
      message: 'Webhook saved and ingestion job enqueued',
    };
  }
}
