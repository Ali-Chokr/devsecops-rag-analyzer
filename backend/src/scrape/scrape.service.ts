import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { IngestService } from '../ingest/ingest.service';
import { ScrapeRequestDto } from '../common/dto/scrape.dto';
import { ScrapeStorageService } from './scrape-storage.service';

const execFileAsync = promisify(execFile);

type ScrapeSource = 'k8s' | 'ansible' | 'terraform';

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
  mode?: string;
  repo_url?: string;
  branch?: string;
}

interface ParsedTerraformMeta {
  file: string;
  resource_type?: string;
  resource_name?: string;
  module_name?: string;
  provider?: string;
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
    const mode =
      body.mode ?? this.config.get<string>('SCRAPER_K8S_MODE') ?? 'filesystem';
    const environment =
      body.environment ?? this.config.get<string>('SCRAPER_ENVIRONMENT');

    if (mode === 'api') {
      return this.scrapeK8sApi(environment, body.namespace);
    }

    const root = this.resolvePath(
      body.path ?? this.config.get<string>('SCRAPER_K8S_PATH'),
      'SCRAPER_K8S_PATH',
    );
    return this.scrapeFilesystem('k8s', root, environment, (content, file) =>
      this.parseK8sMetadata(content, file),
    );
  }

  async scrapeAnsible(body: ScrapeRequestDto = {}) {
    const mode =
      body.mode ??
      this.config.get<string>('SCRAPER_ANSIBLE_MODE') ??
      'filesystem';
    const environment =
      body.environment ?? this.config.get<string>('SCRAPER_ENVIRONMENT');

    if (mode === 'git') {
      return this.scrapeAnsibleGit(body, environment);
    }

    const root = this.resolvePath(
      body.path ?? this.config.get<string>('SCRAPER_ANSIBLE_PATH'),
      'SCRAPER_ANSIBLE_PATH',
    );
    return this.scrapeFilesystem('ansible', root, environment, (content, file) =>
      this.parseAnsibleMetadata(content, file),
    );
  }

  async scrapeTerraform(body: ScrapeRequestDto = {}) {
    const root = this.resolvePath(
      body.path ?? this.config.get<string>('SCRAPER_TERRAFORM_PATH'),
      'SCRAPER_TERRAFORM_PATH',
    );
    const environment =
      body.environment ?? this.config.get<string>('SCRAPER_ENVIRONMENT');
    return this.scrapeFilesystem(
      'terraform',
      root,
      environment,
      (content, file) => this.parseTerraformMetadata(content, file),
      /\.(tf|tfvars|hcl)$/i,
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

  private async scrapeK8sApi(
    environment: string | undefined,
    namespace?: string,
  ) {
    const args = ['get', 'all', '-o', 'yaml'];
    if (namespace) {
      args.push('-n', namespace);
    } else {
      args.push('-A');
    }

    let stdout: string;
    try {
      const result = await execFileAsync('kubectl', args, {
        maxBuffer: 10 * 1024 * 1024,
      });
      stdout = result.stdout;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException({
        message: `kubectl scrape failed: ${message}`,
        code: 'K8S_API_SCRAPE_FAILED',
      });
    }

    const documents = stdout
      .split('---')
      .map((doc) => doc.trim())
      .filter(Boolean);
    const jobs: Array<{ job_id: string; job_file: string; raw_file: string }> =
      [];

    for (let index = 0; index < documents.length; index += 1) {
      const content = documents[index];
      const fileName = `kubectl-all-${index + 1}.yaml`;
      const meta = {
        ...this.parseK8sMetadata(content, fileName),
        mode: 'api',
      };
      const rawFile = await this.storage.saveRawFile('k8s', fileName, content);
      const enqueued = await this.ingest.enqueue({
        source: 'k8s',
        raw_file: rawFile,
        environment: environment ?? meta.namespace,
        service: meta.name ?? fileName,
        meta,
      });
      if (enqueued.ok && enqueued.id && enqueued.file) {
        jobs.push({
          job_id: enqueued.id,
          job_file: enqueued.file,
          raw_file: rawFile,
        });
      }
    }

    return {
      accepted: true,
      source: 'k8s',
      mode: 'api',
      namespace: namespace ?? 'all',
      files_found: documents.length,
      jobs_enqueued: jobs.length,
      jobs,
      message: 'k8s api scrape completed',
    };
  }

  private async scrapeAnsibleGit(
    body: ScrapeRequestDto,
    environment: string | undefined,
  ) {
    const repoUrl =
      body.repo_url ?? this.config.get<string>('SCRAPER_ANSIBLE_GIT_URL');
    if (!repoUrl) {
      throw new BadRequestException({
        message: 'repo_url or SCRAPER_ANSIBLE_GIT_URL is required for git mode',
        code: 'ANSIBLE_GIT_URL_MISSING',
      });
    }

    const branch =
      body.branch ??
      this.config.get<string>('SCRAPER_ANSIBLE_GIT_BRANCH') ??
      'main';
    const subpath =
      body.subpath ?? this.config.get<string>('SCRAPER_ANSIBLE_SUBPATH') ?? '';
    const dataRoot = this.config.get<string>('DATA_DIR') ?? './data';
    const cacheDir = path.resolve(dataRoot, 'cache', 'ansible-git');

    await fs.mkdir(path.dirname(cacheDir), { recursive: true });
    try {
      await fs.access(path.join(cacheDir, '.git'));
      await execFileAsync('git', ['-C', cacheDir, 'fetch', '--all']);
      await execFileAsync('git', ['-C', cacheDir, 'checkout', branch]);
      await execFileAsync('git', ['-C', cacheDir, 'pull', 'origin', branch]);
    } catch {
      await fs.rm(cacheDir, { recursive: true, force: true });
      await execFileAsync('git', [
        'clone',
        '--branch',
        branch,
        repoUrl,
        cacheDir,
      ]);
    }

    const scanRoot = subpath ? path.join(cacheDir, subpath) : cacheDir;
    const result = await this.scrapeFilesystem(
      'ansible',
      scanRoot,
      environment,
      (content, file) => ({
        ...this.parseAnsibleMetadata(content, file),
        mode: 'git',
        repo_url: repoUrl,
        branch,
      }),
    );

    return {
      ...result,
      mode: 'git',
      repo_url: repoUrl,
      branch,
      scanned_path: scanRoot,
    };
  }

  private async scrapeFilesystem(
    source: ScrapeSource,
    root: string,
    environment: string | undefined,
    parseMeta: (
      content: string,
      file: string,
    ) => ParsedK8sMeta | ParsedAnsibleMeta | ParsedTerraformMeta,
    filePattern: RegExp = /\.(ya?ml)$/i,
  ) {
    const files = await this.collectFiles(root, filePattern);
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

  private async collectFiles(
    root: string,
    filePattern: RegExp,
  ): Promise<string[]> {
    try {
      await fs.access(root);
    } catch {
      throw new NotFoundException({
        message: `Scrape path does not exist: ${root}`,
        code: 'SCRAPER_PATH_NOT_FOUND',
      });
    }

    const results: string[] = [];
    await this.walk(root, results, filePattern);
    return results.sort();
  }

  private async walk(
    dir: string,
    results: string[],
    filePattern: RegExp,
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(fullPath, results, filePattern);
        continue;
      }
      if (filePattern.test(entry.name)) {
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

  private parseTerraformMetadata(
    content: string,
    file: string,
  ): ParsedTerraformMeta {
    const resource = content.match(/resource\s+"([^"]+)"\s+"([^"]+)"/m);
    const module = content.match(/module\s+"([^"]+)"/m);
    const provider = content.match(/provider\s+"([^"]+)"/m);
    return {
      file,
      resource_type: resource?.[1],
      resource_name: resource?.[2],
      module_name: module?.[1],
      provider: provider?.[1],
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
    meta: ParsedK8sMeta | ParsedAnsibleMeta | ParsedTerraformMeta,
    fileName: string,
  ): string | undefined {
    if (source === 'k8s') {
      return (meta as ParsedK8sMeta).name ?? path.parse(fileName).name;
    }
    if (source === 'terraform') {
      const tfMeta = meta as ParsedTerraformMeta;
      return (
        tfMeta.resource_name ??
        tfMeta.module_name ??
        path.parse(fileName).name
      );
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
    meta: ParsedK8sMeta | ParsedAnsibleMeta | ParsedTerraformMeta,
  ): string | undefined {
    if (source === 'k8s') {
      return (meta as ParsedK8sMeta).namespace;
    }
    if (source === 'terraform') {
      return undefined;
    }
    return (meta as ParsedAnsibleMeta).hosts;
  }
}
