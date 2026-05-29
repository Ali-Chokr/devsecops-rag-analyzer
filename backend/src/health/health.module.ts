import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { HealthController } from './health.controller';

@Module({
  imports: [RagModule],
  controllers: [HealthController],
})
export class HealthModule {}
