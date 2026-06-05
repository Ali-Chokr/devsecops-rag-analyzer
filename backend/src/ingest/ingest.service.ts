import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly queueDir: string;

  constructor() {
    this.queueDir = path.join(process.cwd(), 'data', 'ingest_jobs');
  }

  async ensureQueueDir() {
    try {
      await fs.mkdir(this.queueDir, { recursive: true });
    } catch (err) {
      this.logger.warn(`Could not ensure ingest queue dir: ${err}`);
    }
  }

  async enqueue(job: Record<string, unknown>) {
    await this.ensureQueueDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `${timestamp}-${Math.floor(Math.random() * 100000)}.json`;
    const filePath = path.join(this.queueDir, id);
    const payload = {
      id,
      created_at: new Date().toISOString(),
      status: 'queued',
      job,
    };
    try {
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      this.logger.log(`Enqueued ingest job ${id}`);
      return { ok: true, id, file: filePath };
    } catch (err) {
      this.logger.error(`Failed to enqueue job: ${err}`);
      return { ok: false, error: String(err) };
    }
  }
}
