import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3ArchiveService } from '../archive/s3-archive.service';
import { EventsService } from '../events/events.service';
import { ForwardLogsDto } from './dto/forward-logs.dto';
import { IngestService } from './ingest.service';

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);
  private readonly logsDir: string;

  constructor(
    private readonly ingest: IngestService,
    private readonly events: EventsService,
    private readonly archive: S3ArchiveService,
  ) {
    const dataRoot = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
    this.logsDir = path.join(dataRoot, 'logs');
  }

  async forward(body: ForwardLogsDto) {
    await fs.mkdir(this.logsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const service = body.service_name ?? 'unknown';
    const filename = `${timestamp}-${service}.log`;
    const filePath = path.join(this.logsDir, filename);

    const header = [
      body.hostname ? `hostname: ${body.hostname}` : null,
      body.log_level ? `level: ${body.log_level}` : null,
      body.environment ? `environment: ${body.environment}` : null,
      `received_at: ${new Date().toISOString()}`,
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    const logBody = `${header}\n${body.content}`;
    try {
      await fs.writeFile(filePath, logBody, 'utf8');
    } catch (err) {
      this.logger.error(`Failed to save log file: ${err}`);
      throw new InternalServerErrorException({
        message: 'Failed to persist log payload',
        code: 'LOG_SAVE_FAILED',
      });
    }

    const s3Uri = await this.archive.archiveObject(
      `logs/${filename}`,
      logBody,
      'text/plain',
    );

    const job = {
      source: 'log',
      raw_file: filePath,
      environment: body.environment,
      service: body.service_name,
      meta: {
        hostname: body.hostname,
        log_level: body.log_level,
        file: filename,
        s3_uri: s3Uri,
      },
    };

    const enq = await this.ingest.enqueue(job);
    if (!enq.ok) {
      throw new InternalServerErrorException({
        message: 'Failed to enqueue log ingestion job',
        code: 'LOG_ENQUEUE_FAILED',
        detail: enq.error,
      });
    }

    this.events.emit(
      'log.forwarded',
      `Runtime log received from ${service}`,
      {
        service_name: service,
        environment: body.environment,
        job_id: enq.db_id ?? enq.id,
      },
    );

    return {
      accepted: true,
      log_file: filePath,
      job_id: enq.id,
      db_id: enq.db_id,
      message: 'Log saved and ingestion job enqueued',
    };
  }
}
