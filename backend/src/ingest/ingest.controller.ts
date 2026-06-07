import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RagService } from '../rag/rag.service';
import { WorkerSecretGuard } from '../common/guards/worker-secret.guard';
import { ForwardLogsDto } from './dto/forward-logs.dto';
import { IngestDocumentsDto } from './dto/ingest-documents.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { IngestService } from './ingest.service';
import { LogsService } from './logs.service';

@Controller('api/ingest')
export class IngestController {
  constructor(
    private readonly ingest: IngestService,
    private readonly logs: LogsService,
    private readonly rag: RagService,
  ) {}

  @Post()
  @HttpCode(202)
  async ingestDocuments(@Body() body: IngestDocumentsDto) {
    const result = await this.rag.ingest(body.documents);
    return {
      accepted: true,
      ...result,
    };
  }

  @Post('logs')
  @HttpCode(202)
  async forwardLogs(@Body() body: ForwardLogsDto) {
    return this.logs.forward(body);
  }

  @Get('jobs')
  async listJobs(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 50, 200) : 50;
    const jobs = await this.ingest.listJobs(status, parsedLimit);
    return { jobs, count: jobs.length };
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const job = await this.ingest.getJob(id);
    if (!job) {
      return { found: false, job: null };
    }
    return { found: true, job };
  }

  @UseGuards(WorkerSecretGuard)
  @Patch('jobs/:id/status')
  @HttpCode(200)
  async updateJobStatus(
    @Param('id') id: string,
    @Body() body: UpdateJobStatusDto,
  ) {
    const updated = await this.ingest.updateJobStatus(
      id,
      body.status,
      body.error_message,
    );
    return { updated, id, status: body.status };
  }
}
