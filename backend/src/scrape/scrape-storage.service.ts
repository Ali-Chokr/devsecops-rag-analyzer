import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ScrapeStorageService {
  private readonly logger = new Logger(ScrapeStorageService.name);
  private readonly dataRoot: string;

  constructor() {
    this.dataRoot = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
  }

  scrapedDir(source: 'k8s' | 'ansible' | 'terraform'): string {
    return path.join(this.dataRoot, 'scraped', source);
  }

  async ensureScrapedDir(
    source: 'k8s' | 'ansible' | 'terraform',
  ): Promise<string> {
    const dir = this.scrapedDir(source);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async saveRawFile(
    source: 'k8s' | 'ansible' | 'terraform',
    filename: string,
    content: string,
  ): Promise<string> {
    const dir = await this.ensureScrapedDir(source);
    const safeName = filename.replace(/[^\w.\-]+/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(dir, `${stamp}-${safeName}`);
    await fs.writeFile(filePath, content, 'utf8');
    this.logger.log(`Saved scraped ${source} file to ${filePath}`);
    return filePath;
  }
}
