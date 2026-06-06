import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly storageDir: string;

  constructor() {
    const dataRoot = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
    this.storageDir = path.join(dataRoot, 'webhooks');
  }

  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (err) {
      this.logger.warn(`Could not ensure storage dir: ${err}`);
    }
  }

  async saveRawPayload(payload: unknown, meta: Record<string, unknown> = {}) {
    await this.ensureStorageDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `${timestamp}-${Math.floor(Math.random() * 100000)}.json`;
    const filePath = path.join(this.storageDir, id);
    const data = {
      received_at: new Date().toISOString(),
      meta,
      payload,
    };
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), { encoding: 'utf8' });
      this.logger.log(`Saved webhook payload to ${filePath}`);
      return { ok: true, file: filePath, id };
    } catch (err) {
      this.logger.error(`Failed to save webhook payload: ${err}`);
      return { ok: false, error: String(err) };
    }
  }
}
