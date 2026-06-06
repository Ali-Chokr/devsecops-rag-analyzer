import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let config: Partial<ConfigService>;
  let reflector: Partial<Reflector>;

  const createContext = (headers: Record<string, string> = {}): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
        }),
      }),
      getType: () => 'http',
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    config = { get: jest.fn() };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new ApiKeyGuard(config as ConfigService, reflector as Reflector);
  });

  it('allows public routes without a key', () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? true : false,
    );
    (config.get as jest.Mock).mockReturnValue('secret-key');

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows all routes when API_KEY is unset', () => {
    (config.get as jest.Mock).mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows requests with matching X-API-Key header', () => {
    (config.get as jest.Mock).mockReturnValue('secret-key');

    expect(
      guard.canActivate(createContext({ 'x-api-key': 'secret-key' })),
    ).toBe(true);
  });

  it('allows requests with matching Bearer token', () => {
    (config.get as jest.Mock).mockReturnValue('secret-key');

    expect(
      guard.canActivate(
        createContext({ authorization: 'Bearer secret-key' }),
      ),
    ).toBe(true);
  });

  it('rejects requests with invalid key', () => {
    (config.get as jest.Mock).mockReturnValue('secret-key');

    expect(() => guard.canActivate(createContext({ 'x-api-key': 'wrong' }))).toThrow(
      UnauthorizedException,
    );
  });
});
