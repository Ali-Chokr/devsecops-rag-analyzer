import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class S3ArchiveService {
  private readonly logger = new Logger(S3ArchiveService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION');
    const bucket = this.config.get<string>('AWS_S3_BUCKET');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.bucket = bucket;
    if (region && bucket) {
      this.client = new S3Client({
        region,
        credentials:
          accessKeyId && secretAccessKey
            ? { accessKeyId, secretAccessKey }
            : undefined,
      });
    } else {
      this.client = null;
    }
  }

  isEnabled(): boolean {
    return Boolean(this.client && this.bucket);
  }

  async archiveObject(
    key: string,
    body: string,
    contentType = 'text/plain',
  ): Promise<string | null> {
    if (!this.client || !this.bucket) {
      return null;
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      const uri = `s3://${this.bucket}/${key}`;
      this.logger.log(`Archived object to ${uri}`);
      return uri;
    } catch (err) {
      this.logger.warn(`S3 archival failed for ${key}: ${err}`);
      return null;
    }
  }
}
