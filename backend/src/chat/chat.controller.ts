import { Body, Controller, Post } from '@nestjs/common';
import { RagService } from '../rag/rag.service';

class ChatDto {
  query!: string;
  environment?: string;
}

@Controller('api/chat')
export class ChatController {
  constructor(private readonly rag: RagService) {}

  @Post()
  async chat(@Body() body: ChatDto) {
    return this.rag.query(body.query, body.environment);
  }
}
