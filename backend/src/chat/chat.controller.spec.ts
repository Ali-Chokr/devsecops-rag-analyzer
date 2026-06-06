import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { RagService } from '../rag/rag.service';

describe('ChatController', () => {
  let controller: ChatController;
  let ragService: Partial<RagService>;

  beforeEach(async () => {
    ragService = {
      query: jest.fn().mockResolvedValue({ answer: 'ok', chunks: [] }),
      streamQuery: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: RagService, useValue: ragService }],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('forwards validated chat requests to the RAG service', async () => {
    const response = await controller.chat({
      query: 'X-402 on staging',
      environment: 'staging',
      source_types: ['log'],
    });

    expect(ragService.query).toHaveBeenCalledWith('X-402 on staging', 'staging', [
      'log',
    ]);
    expect(response).toEqual({ answer: 'ok', chunks: [] });
  });

  it('delegates streaming chat requests to the RAG service', async () => {
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as unknown as import('express').Response;

    await controller.stream(
      { query: 'timeout on staging', environment: 'staging' },
      res,
    );

    expect(ragService.streamQuery).toHaveBeenCalledWith(
      'timeout on staging',
      'staging',
      undefined,
      res,
    );
  });
});
