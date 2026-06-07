import { ConfigService } from '@nestjs/config';
import { S3ArchiveService } from './s3-archive.service';

describe('S3ArchiveService', () => {
  it('is disabled without AWS config', () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const service = new S3ArchiveService(config);
    expect(service.isEnabled()).toBe(false);
  });

  it('is enabled when region and bucket are configured', () => {
    const config = {
      get: (key: string) => {
        if (key === 'AWS_REGION') return 'us-east-1';
        if (key === 'AWS_S3_BUCKET') return 'test-bucket';
        return undefined;
      },
    } as unknown as ConfigService;
    const service = new S3ArchiveService(config);
    expect(service.isEnabled()).toBe(true);
  });
});
