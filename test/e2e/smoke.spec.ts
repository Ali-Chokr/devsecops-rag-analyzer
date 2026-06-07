import { describe, expect, it } from 'vitest';

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';

describe('DevSecOps RAG smoke e2e', () => {
  it('health endpoint returns API and RAG status', async () => {
    const response = await fetch(`${backendUrl}/api/health`);
    expect(response.ok).toBe(true);
    const payload = await response.json();
    expect(payload).toHaveProperty('status');
  });

  it('root endpoint returns API metadata', async () => {
    const response = await fetch(backendUrl);
    expect(response.ok).toBe(true);
    const payload = await response.json();
    expect(payload.name).toContain('DevSecOps RAG Analyzer');
  });
});
