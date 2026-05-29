import { Controller, Get } from '@nestjs/common';
import { RagService } from '../rag/rag.service';

@Controller('api/health')
export class HealthController {
  constructor(private readonly rag: RagService) {}

  @Get()
  async check() {
    try {
      const rag = await this.rag.health();
      return { api: 'ok', rag_engine: rag };
    } catch (error) {
      return {
        api: 'ok',
        rag_engine: { status: 'unreachable', error: String(error) },
      };
    }
  }
}
