import { WebhooksService } from './webhooks.service';
import { S3ArchiveService } from '../archive/s3-archive.service';
import { ConfigService } from '@nestjs/config';

describe('WebhooksService', () => {
  const archive = new S3ArchiveService({
    get: () => undefined,
  } as unknown as ConfigService);

  const service = new WebhooksService(archive);

  it('parses pipeline failures from GitLab payload', () => {
    const parsed = service.parseGitLabPayload({
      object_kind: 'pipeline',
      project: { name: 'payment-service', path_with_namespace: 'platform/payment-service' },
      object_attributes: {
        id: 42,
        ref: 'staging',
        status: 'failed',
        sha: 'abc123',
      },
      builds: [
        { name: 'deploy', stage: 'deploy', status: 'failed', failure_reason: 'script_failure' },
        { name: 'test', stage: 'test', status: 'success' },
      ],
    });

    expect(parsed.project_name).toBe('payment-service');
    expect(parsed.status).toBe('failed');
    expect(parsed.failed_jobs).toHaveLength(1);
    expect(parsed.failed_jobs[0].name).toBe('deploy');
    expect(parsed.environment).toBe('staging');
    expect(parsed.summary).toContain('payment-service');
  });
});
