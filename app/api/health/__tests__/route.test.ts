import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetSigningIdentityForTests } from '@/lib/auth/signing-identity';

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock('@/db', () => ({
  db: { execute: executeMock },
}));

describe('GET /api/health (links)', () => {
  afterEach(() => {
    executeMock.mockReset();
    vi.resetModules();
    resetSigningIdentityForTests();
  });

  it('reports ok when the database round-trip succeeds', async () => {
    executeMock.mockResolvedValue(undefined);
    const { GET } = await import('../route');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', service: 'links', claimed: false });
    expect(typeof body.timestamp).toBe('string');
  });

  it('reports claimed:true once a signing identity is in place', async () => {
    executeMock.mockResolvedValue(undefined);
    (globalThis as Record<symbol, unknown>)[Symbol.for('imajin.app.signingIdentity')] = {
      appDid: 'did:imajin:app-under-test',
      privateKey: 'fixture-private',
      publicKey: 'fixture-public',
    };
    const { GET } = await import('../route');

    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({ status: 'ok', claimed: true });
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
