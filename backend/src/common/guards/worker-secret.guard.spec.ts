import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { WorkerSecretGuard } from './worker-secret.guard';

describe('WorkerSecretGuard', () => {
  const createContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ header: (name: string) => headers[name.toLowerCase()] }),
      }),
    }) as ExecutionContext;

  it('allows matching worker secret', () => {
    const config = {
      get: (key: string) => (key === 'WORKER_SECRET' ? 'secret' : undefined),
    } as ConfigService;
    const guard = new WorkerSecretGuard(config);
    expect(guard.canActivate(createContext({ 'x-worker-secret': 'secret' }))).toBe(true);
  });

  it('rejects invalid worker secret', () => {
    const config = {
      get: (key: string) => (key === 'WORKER_SECRET' ? 'secret' : undefined),
    } as ConfigService;
    const guard = new WorkerSecretGuard(config);
    expect(() => guard.canActivate(createContext({ 'x-worker-secret': 'wrong' }))).toThrow(
      UnauthorizedException,
    );
  });
});
