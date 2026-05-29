import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * GitLab CI/CD webhook receiver (Phase 1).
 * Configure in GitLab: Settings → Webhooks → URL: POST /api/webhooks/gitlab
 */
@Controller('api/webhooks')
export class WebhooksController {
  constructor(private readonly config: ConfigService) {}

  @Post('gitlab')
  @HttpCode(202)
  receiveGitLab(
    @Body() payload: Record<string, unknown>,
    @Headers('x-gitlab-token') token?: string,
  ) {
    const secret = this.config.get<string>('GITLAB_WEBHOOK_SECRET');
    if (secret && token !== secret) {
      return { accepted: false, reason: 'invalid token' };
    }
    // TODO Phase 1: enqueue ingestion job from pipeline job logs
    return {
      accepted: true,
      object_kind: payload['object_kind'],
      message: 'Webhook received; wire to ingestion pipeline next',
    };
  }
}
