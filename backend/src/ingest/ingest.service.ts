import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';

export interface IngestJobRecord {
  id: string;
  source_type: string;
  status: string;
  payload: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  file_id?: string;
  file?: string;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly queueDir: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {
    const dataRoot = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
    this.queueDir = path.join(dataRoot, 'ingest_jobs');
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
    const fileId = `${timestamp}-${Math.floor(Math.random() * 100000)}.json`;
    const filePath = path.join(this.queueDir, fileId);
    const payload = {
      id: fileId,
      created_at: new Date().toISOString(),
      status: 'queued',
      job,
    };
    try {
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      this.logger.log(`Enqueued ingest job ${fileId}`);

      const sourceType = String(job.source ?? 'unknown');
      const dbId = await this.recordJobInDb(sourceType, {
        ...job,
        file_id: fileId,
        file: filePath,
      });

      this.events.emit('ingest.job.enqueued', `Ingest job queued (${sourceType})`, {
        job_id: dbId ?? fileId,
        file_id: fileId,
        source: sourceType,
      });

      return { ok: true, id: fileId, file: filePath, db_id: dbId };
    } catch (err) {
      this.logger.error(`Failed to enqueue job: ${err}`);
      return { ok: false, error: String(err) };
    }
  }

  private async recordJobInDb(
    sourceType: string,
    jobPayload: Record<string, unknown>,
  ): Promise<string | null> {
    if (!this.db.isEnabled()) {
      return null;
    }
    try {
      const row = await this.db.queryOne<{ id: string }>(
        `INSERT INTO ingestion_jobs (source_type, status, payload)
         VALUES ($1, 'queued', $2::jsonb)
         RETURNING id::text`,
        [sourceType, JSON.stringify(jobPayload)],
      );
      return row?.id ?? null;
    } catch (err) {
      this.logger.warn(`Failed to record job in DB: ${err}`);
      return null;
    }
  }

  async listJobs(status?: string, limit = 50): Promise<IngestJobRecord[]> {
    if (!this.db.isEnabled()) {
      return this.listJobsFromFilesystem(status, limit);
    }
    const params: unknown[] = [];
    let sql = `SELECT id::text, source_type, status, payload, started_at, completed_at,
                      error_message, created_at
               FROM ingestion_jobs`;
    if (status) {
      params.push(status);
      sql += ` WHERE status = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    return this.db.query<IngestJobRecord>(sql, params);
  }

  async getJob(id: string): Promise<IngestJobRecord | null> {
    if (!this.db.isEnabled()) {
      return this.getJobFromFilesystem(id);
    }
    return this.db.queryOne<IngestJobRecord>(
      `SELECT id::text, source_type, status, payload, started_at, completed_at,
              error_message, created_at
       FROM ingestion_jobs
       WHERE id::text = $1 OR payload->>'file_id' = $1`,
      [id],
    );
  }

  async updateJobStatus(
    id: string,
    status: string,
    errorMessage?: string,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const started = status === 'processing' ? now : null;
    const completed = ['completed', 'failed'].includes(status) ? now : null;

    if (this.db.isEnabled()) {
      try {
        await this.db.query(
          `UPDATE ingestion_jobs
           SET status = $2,
               started_at = COALESCE(started_at, $3::timestamptz),
               completed_at = COALESCE($4::timestamptz, completed_at),
               error_message = COALESCE($5, error_message)
           WHERE id::text = $1 OR payload->>'file_id' = $1`,
          [id, status, started, completed, errorMessage ?? null],
        );
        this.emitJobStatusEvent(id, status, errorMessage);
        return true;
      } catch (err) {
        this.logger.warn(`Failed to update job status in DB: ${err}`);
        return false;
      }
    }

    return this.updateJobStatusOnFilesystem(
      id,
      status,
      started,
      completed,
      errorMessage,
    );
  }

  private emitJobStatusEvent(
    id: string,
    status: string,
    errorMessage?: string,
  ): void {
    this.events.emit(
      `ingest.job.${status}`,
      `Ingest job ${status}`,
      { job_id: id, status, error: errorMessage },
    );
  }

  private async updateJobStatusOnFilesystem(
    id: string,
    status: string,
    started: string | null,
    completed: string | null,
    errorMessage?: string,
  ): Promise<boolean> {
    const filePath = await this.resolveJobFilePath(id);
    if (!filePath) {
      return false;
    }

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      data.status = status;
      if (started && !data.started_at) {
        data.started_at = started;
      }
      if (completed) {
        data.completed_at = completed;
      }
      if (errorMessage) {
        data.error_message = errorMessage;
      }
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      this.emitJobStatusEvent(id, status, errorMessage);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to update job status on filesystem: ${err}`);
      return false;
    }
  }

  private async resolveJobFilePath(id: string): Promise<string | null> {
    await this.ensureQueueDir();
    const candidates = [
      path.join(this.queueDir, id),
      path.join(this.queueDir, `${id}.json`),
      path.join(this.queueDir, 'processed', id),
      path.join(this.queueDir, 'processed', `${id}.json`),
      path.join(this.queueDir, 'failed', id),
      path.join(this.queueDir, 'failed', `${id}.json`),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // continue
      }
    }

    const files = await fs.readdir(this.queueDir);
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const filePath = path.join(this.queueDir, file);
        const raw = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(raw) as { id?: string };
        if (data.id === id || file === id) {
          return filePath;
        }
      } catch {
        // skip invalid files
      }
    }

    return null;
  }

  private async listJobsFromFilesystem(
    status?: string,
    limit = 50,
  ): Promise<IngestJobRecord[]> {
    await this.ensureQueueDir();
    const files = await fs.readdir(this.queueDir);
    const jobs: IngestJobRecord[] = [];
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(path.join(this.queueDir, file), 'utf8');
        const data = JSON.parse(raw) as {
          status?: string;
          job?: Record<string, unknown>;
          created_at?: string;
        };
        const jobStatus = data.status ?? 'queued';
        if (status && jobStatus !== status) {
          continue;
        }
        jobs.push({
          id: file,
          source_type: String(data.job?.source ?? 'unknown'),
          status: jobStatus,
          payload: data.job ?? null,
          started_at: null,
          completed_at: null,
          error_message: null,
          created_at: data.created_at ?? new Date().toISOString(),
          file_id: file,
        });
      } catch {
        // skip invalid files
      }
    }
    return jobs
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  private async getJobFromFilesystem(id: string): Promise<IngestJobRecord | null> {
    const jobs = await this.listJobsFromFilesystem(undefined, 200);
    return jobs.find((j) => j.id === id || j.file_id === id) ?? null;
  }
}
