import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RagService } from './rag.service';

@Module({
  imports: [HttpModule.register({ timeout: 120_000 })],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
