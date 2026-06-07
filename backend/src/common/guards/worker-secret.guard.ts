import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class WorkerSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const workerSecret = this.config.get<string>('WORKER_SECRET');
    const apiKey = this.config.get<string>('API_KEY');
    const request = context.switchToHttp().getRequest<Request>();

    if (workerSecret) {
      const provided = request.header('x-worker-secret');
      if (provided === workerSecret) {
        return true;
      }
    }

    if (apiKey) {
      const headerKey = request.header('x-api-key');
      const authorization = request.header('authorization');
      const bearer = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;
      if (headerKey === apiKey || bearer === apiKey) {
        return true;
      }
    }

    if (!workerSecret && !apiKey) {
      return true;
    }

    throw new UnauthorizedException({
      message: 'Invalid or missing worker secret',
      code: 'UNAUTHORIZED',
    });
  }
}
