import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  private getPool(): Pool | null {
    if (this.pool) {
      return this.pool;
    }
    const url = this.config.get<string>('DATABASE_URL');
    if (!url) {
      return null;
    }
    this.pool = new Pool({ connectionString: url });
    this.pool.on('error', (err) => {
      this.logger.error(`Postgres pool error: ${err.message}`);
    });
    return this.pool;
  }

  isEnabled(): boolean {
    return Boolean(this.config.get<string>('DATABASE_URL'));
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const pool = this.getPool();
    if (!pool) {
      return [];
    }
    const result = await pool.query<T>(sql, params);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
