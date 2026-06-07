import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request);
    if (!token) {
      throw new UnauthorizedException({
        message: 'Missing JWT bearer token',
        code: 'JWT_MISSING',
      });
    }

    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) {
      throw new UnauthorizedException({
        message: 'Invalid JWT format',
        code: 'JWT_INVALID',
      });
    }

    const expected = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const provided = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (
      provided.length !== expectedBuf.length ||
      !timingSafeEqual(provided, expectedBuf)
    ) {
      throw new UnauthorizedException({
        message: 'Invalid JWT signature',
        code: 'JWT_INVALID',
      });
    }

    (request as Request & { user?: unknown }).user = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    return true;
  }

  private extractBearer(request: Request): string | undefined {
    const authorization = request.header('authorization');
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }
    return undefined;
  }
}
