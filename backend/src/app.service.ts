import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getApiInfo() {
    return {
      name: 'DevSecOps RAG Analyzer API',
      version: '1.0.0',
      docs: '/api/docs',
      health: '/api/health',
    };
  }
}
