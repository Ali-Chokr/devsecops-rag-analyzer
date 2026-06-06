import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const apiKey = this.config.get<string>('API_KEY');
    if (!apiKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = this.extractKey(request);
    if (provided === apiKey) {
      return true;
    }

    throw new UnauthorizedException({
      message: 'Invalid or missing API key',
      code: 'UNAUTHORIZED',
    });
  }

  private extractKey(request: Request): string | undefined {
    const headerKey = request.header('x-api-key');
    if (headerKey) {
      return headerKey;
    }

    const authorization = request.header('authorization');
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }

    return undefined;
  }
}
