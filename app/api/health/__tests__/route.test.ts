import { afterEach, describe, expect, it, vi } from 'vitest';

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock('@/db', () => ({
  db: { execute: executeMock },
}));

describe('GET /api/health (links)', () => {
  afterEach(() => {
    executeMock.mockReset();
    vi.resetModules();
  });

  it('reports ok when the database round-trip succeeds', async () => {
    executeMock.mockResolvedValue(undefined);
    const { GET } = await import('../route');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', service: 'links' });
    expect(typeof body.timestamp).toBe('string');
  });

  it('reports degraded (503) when the database round-trip fails, without throwing', async () => {
    executeMock.mockRejectedValue(new Error('connection refused'));
    const { GET } = await import('../route');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: 'degraded', service: 'links' });
  });
});
