import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IngestService } from '../ingest/ingest.service';
import { ScrapeRequestDto } from '../common/dto/scrape.dto';
import { ScrapeStorageService } from './scrape-storage.service';

type ScrapeSource = 'k8s' | 'ansible';

interface ParsedK8sMeta {
  file: string;
  kind?: string;
  name?: string;
  namespace?: string;
}

interface ParsedAnsibleMeta {
  file: string;
  playbook_name?: string;
  hosts?: string;
  service_name?: string;
}

@Injectable()
export class ScrapeService {
  private readonly logger = new Logger(ScrapeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly storage: ScrapeStorageService,
    private readonly ingest: IngestService,
  ) {}

  async scrapeK8s(body: ScrapeRequestDto = {}) {
    const root = this.resolvePath(
      body.path ?? this.config.get<string>('SCRAPER_K8S_PATH'),
      'SCRAPER_K8S_PATH',
    );
    const environment =
      body.environment ?? this.config.get<string>('SCRAPER_ENVIRONMENT');
    return this.scrapeFilesystem('k8s', root, environment, (content, file) =>
      this.parseK8sMetadata(content, file),
    );
  }

  async scrapeAnsible(body: ScrapeRequestDto = {}) {
    const root = this.resolvePath(
      body.path ?? this.config.get<string>('SCRAPER_ANSIBLE_PATH'),
      'SCRAPER_ANSIBLE_PATH',
    );
    const environment =
      body.environment ?? this.config.get<string>('SCRAPER_ENVIRONMENT');
    return this.scrapeFilesystem('ansible', root, environment, (content, file) =>
      this.parseAnsibleMetadata(content, file),
    );
  }

  private resolvePath(configured: string | undefined, envName: string): string {
    if (!configured) {
      throw new NotFoundException({
        message: `${envName} is not configured and no path was provided`,
        code: 'SCRAPER_PATH_MISSING',
      });
    }
    return path.resolve(configured);
  }

  private async scrapeFilesystem(
    source: ScrapeSource,
    root: string,
    environment: string | undefined,
    parseMeta: (content: string, file: string) => ParsedK8sMeta | ParsedAnsibleMeta,
  ) {
    const files = await this.collectYamlFiles(root);
    const jobs: Array<{ job_id: string; job_file: string; raw_file: string }> = [];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf8');
      const fileName = path.basename(filePath);
      const meta = parseMeta(content, fileName);
      const rawFile = await this.storage.saveRawFile(source, fileName, content);
      const serviceName = this.resolveServiceName(source, meta, fileName);
      const enqueued = await this.ingest.enqueue({
        source,
        raw_file: rawFile,
        environment: environment ?? this.inferEnvironment(source, meta),
        service: serviceName,
        meta: {
          ...meta,
          scraped_at: new Date().toISOString(),
          source_path: filePath,
        },
      });

      if (!enqueued.ok || !enqueued.id || !enqueued.file) {
        this.logger.error(`Failed to enqueue ${source} scrape for ${fileName}`);
        continue;
      }

      jobs.push({
        job_id: enqueued.id,
        job_file: enqueued.file,
        raw_file: rawFile,
      });
    }

    return {
      accepted: true,
      source,
      scanned_path: root,
      files_found: files.length,
      jobs_enqueued: jobs.length,
      jobs,
      message: `${source} scrape completed`,
    };
  }

  private async collectYamlFiles(root: string): Promise<string[]> {
    try {
      await fs.access(root);
    } catch {
      throw new NotFoundException({
        message: `Scrape path does not exist: ${root}`,
        code: 'SCRAPER_PATH_NOT_FOUND',
      });
    }

    const results: string[] = [];
    await this.walk(root, results);
    return results.sort();
  }

  private async walk(dir: string, results: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(fullPath, results);
        continue;
      }
      if (/\.(ya?ml)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  private parseK8sMetadata(content: string, file: string): ParsedK8sMeta {
    return {
      file,
      kind: this.matchLine(content, /^kind:\s*(\S+)/m),
      name: this.matchLine(content, /^\s*name:\s*(\S+)/m),
      namespace: this.matchLine(content, /^\s*namespace:\s*(\S+)/m),
    };
  }

  private parseAnsibleMetadata(content: string, file: string): ParsedAnsibleMeta {
    return {
      file,
      playbook_name: this.matchLine(content, /^- name:\s*(.+)$/m),
      hosts: this.matchLine(content, /^\s*hosts:\s*(\S+)/m),
      service_name: this.matchLine(content, /^\s*service_name:\s*(\S+)/m),
    };
  }

  private matchLine(content: string, pattern: RegExp): string | undefined {
    const match = content.match(pattern);
    return match?.[1]?.trim();
  }

  private resolveServiceName(
    source: ScrapeSource,
    meta: ParsedK8sMeta | ParsedAnsibleMeta,
    fileName: string,
  ): string | undefined {
    if (source === 'k8s') {
      return (meta as ParsedK8sMeta).name ?? path.parse(fileName).name;
    }
    const ansibleMeta = meta as ParsedAnsibleMeta;
    if (ansibleMeta.service_name) {
      return ansibleMeta.service_name;
    }
    const stem = path.parse(fileName).name;
    return stem.replace(/-(staging|prod|production|dev)$/i, '') || stem;
  }

  private inferEnvironment(
    source: ScrapeSource,
    meta: ParsedK8sMeta | ParsedAnsibleMeta,
  ): string | undefined {
    if (source === 'k8s') {
      return (meta as ParsedK8sMeta).namespace;
    }
    return (meta as ParsedAnsibleMeta).hosts;
  }
}
