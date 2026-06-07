import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3ArchiveService } from '../archive/s3-archive.service';

export interface ParsedGitLabEvent {
  object_kind: string;
  project_name?: string;
  project_path?: string;
  ref?: string;
  status?: string;
  failed_jobs: Array<{ name?: string; stage?: string; failure_reason?: string }>;
  pipeline_id?: number;
  commit_sha?: string;
  environment?: string;
  summary: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly storageDir: string;

  constructor(private readonly archive: S3ArchiveService) {
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

  parseGitLabPayload(payload: Record<string, unknown>): ParsedGitLabEvent {
    const objectKind = String(payload.object_kind ?? 'unknown');
    const project = (payload.project as Record<string, unknown>) ?? {};
    const attrs = (payload.object_attributes as Record<string, unknown>) ?? {};
    const builds = Array.isArray(payload.builds) ? payload.builds : [];

    const failedJobs = builds
      .filter((build) => {
        const item = build as Record<string, unknown>;
        return String(item.status ?? '').toLowerCase() === 'failed';
      })
      .map((build) => {
        const item = build as Record<string, unknown>;
        return {
          name: item.name ? String(item.name) : undefined,
          stage: item.stage ? String(item.stage) : undefined,
          failure_reason: item.failure_reason
            ? String(item.failure_reason)
            : undefined,
        };
      });

    const projectName = project.name ? String(project.name) : undefined;
    const ref = attrs.ref ? String(attrs.ref) : undefined;
    const status = attrs.status ? String(attrs.status) : undefined;
    const pipelineId = attrs.id ? Number(attrs.id) : undefined;
    const commitSha = attrs.sha ? String(attrs.sha) : undefined;

    let summary = `GitLab ${objectKind}`;
    if (projectName) {
      summary += ` for ${projectName}`;
    }
    if (status) {
      summary += ` (${status})`;
    }
    if (failedJobs.length > 0) {
      const names = failedJobs
        .map((job) => job.name)
        .filter(Boolean)
        .join(', ');
      summary += ` — failed jobs: ${names}`;
    }

    return {
      object_kind: objectKind,
      project_name: projectName,
      project_path: project.path_with_namespace
        ? String(project.path_with_namespace)
        : undefined,
      ref,
      status,
      failed_jobs: failedJobs,
      pipeline_id: Number.isFinite(pipelineId) ? pipelineId : undefined,
      commit_sha: commitSha,
      environment: ref?.includes('prod')
        ? 'production'
        : ref?.includes('staging')
          ? 'staging'
          : undefined,
      summary,
    };
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
      const serialized = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, serialized, { encoding: 'utf8' });
      const s3Uri = await this.archive.archiveObject(
        `webhooks/${id}`,
        serialized,
        'application/json',
      );
      this.logger.log(`Saved webhook payload to ${filePath}`);
      return { ok: true, file: filePath, id, s3_uri: s3Uri };
    } catch (err) {
      this.logger.error(`Failed to save webhook payload: ${err}`);
      return { ok: false, error: String(err) };
    }
  }
}
