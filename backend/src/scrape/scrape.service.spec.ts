import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { IngestService } from '../ingest/ingest.service';
import { ScrapeService } from './scrape.service';
import { ScrapeStorageService } from './scrape-storage.service';

describe('ScrapeService', () => {
  let service: ScrapeService;
  let tempDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scrape-test-'));
    dataDir = path.join(tempDir, 'data');
    process.env.DATA_DIR = dataDir;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScrapeService,
        ScrapeStorageService,
        IngestService,
        {
          provide: DatabaseService,
          useValue: { isEnabled: () => false, query: jest.fn(), queryOne: jest.fn() },
        },
        { provide: EventsService, useValue: { emit: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SCRAPER_K8S_PATH') {
                return path.join(tempDir, 'k8s');
              }
              if (key === 'SCRAPER_ANSIBLE_PATH') {
                return path.join(tempDir, 'ansible');
              }
              if (key === 'SCRAPER_ENVIRONMENT') {
                return 'staging';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ScrapeService>(ScrapeService);
  });

  afterEach(async () => {
    delete process.env.DATA_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('scrapes k8s manifests and enqueues ingest jobs', async () => {
    const k8sDir = path.join(tempDir, 'k8s');
    await fs.mkdir(k8sDir, { recursive: true });
    await fs.writeFile(
      path.join(k8sDir, 'payment-service.yaml'),
      `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: staging
`,
      'utf8',
    );

    const result = await service.scrapeK8s();

    expect(result.accepted).toBe(true);
    expect(result.files_found).toBe(1);
    expect(result.jobs_enqueued).toBe(1);
    expect(result.jobs[0].raw_file).toContain('payment-service.yaml');
  });

  it('scrapes ansible playbooks and enqueues ingest jobs', async () => {
    const ansibleDir = path.join(tempDir, 'ansible');
    await fs.mkdir(ansibleDir, { recursive: true });
    await fs.writeFile(
      path.join(ansibleDir, 'deploy-payment-staging.yml'),
      `---
- name: Deploy payment-service
  hosts: staging
  vars:
    service_name: payment-service
`,
      'utf8',
    );

    const result = await service.scrapeAnsible();

    expect(result.accepted).toBe(true);
    expect(result.files_found).toBe(1);
    expect(result.jobs_enqueued).toBe(1);
  });

  it('throws when scrape path is missing', async () => {
    await expect(service.scrapeK8s({ path: path.join(tempDir, 'missing') })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
