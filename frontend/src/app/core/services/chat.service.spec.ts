import { describe, expect, it } from 'vitest';

function authHeaders(apiKey?: string): Record<string, string> | undefined {
  return apiKey ? { 'X-API-Key': apiKey } : undefined;
}

describe('ChatService auth headers', () => {
  it('returns undefined when apiKey is empty', () => {
    expect(authHeaders('')).toBeUndefined();
    expect(authHeaders(undefined)).toBeUndefined();
  });

  it('returns X-API-Key header when configured', () => {
    expect(authHeaders('secret-key')).toEqual({ 'X-API-Key': 'secret-key' });
  });
});
