import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatDto } from '../common/dto/chat.dto';
import { RagService } from '../rag/rag.service';

@Controller('api/chat')
export class ChatController {
  constructor(private readonly rag: RagService) {}

  @Post()
  async chat(@Body() body: ChatDto) {
    return this.rag.query(
      body.query,
      body.environment,
      body.source_types,
      body.messages,
    );
  }

  @Post('stream')
  async stream(@Body() body: ChatDto, @Res() res: Response): Promise<void> {
    await this.rag.streamQuery(
      body.query,
      body.environment,
      body.source_types,
      res,
      body.messages,
    );
  }
}
