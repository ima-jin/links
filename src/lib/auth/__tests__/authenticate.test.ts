import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireSessionOrAppTokenMock } = vi.hoisted(() => ({ requireSessionOrAppTokenMock: vi.fn() }));

vi.mock('@ima-jin/auth', () => ({
  requireSessionOrAppToken: requireSessionOrAppTokenMock,
}));

describe('authenticate', () => {
  beforeEach(() => {
    requireSessionOrAppTokenMock.mockReset();
    process.env.NEXT_PUBLIC_APP_URL = 'https://links.example.test';
  });

  it("scopes the audience to this app's own host, mirroring dykil/coffee's #1974 adoption", async () => {
    requireSessionOrAppTokenMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    const { authenticate } = await import('../authenticate');

    const request = new Request('https://links.example.test/api/pages');
    const result = await authenticate(request);

    expect(requireSessionOrAppTokenMock).toHaveBeenCalledWith(request, { aud: 'links.example.test', requireScopes: undefined });
    expect('auth' in result && result.auth.did).toBe('did:imajin:owner');
  });

  it('forwards a failure as { error, status }', async () => {
    requireSessionOrAppTokenMock.mockResolvedValue({ error: 'Not authenticated', status: 401 });
    const { authenticate } = await import('../authenticate');

    const result = await authenticate(new Request('https://links.example.test/api/pages'));

    expect(result).toEqual({ error: 'Not authenticated', status: 401 });
  });

  it('forwards requireScopes through to the underlying check', async () => {
    requireSessionOrAppTokenMock.mockResolvedValue({ error: 'Missing required scope(s): links:write', status: 403 });
    const { authenticate } = await import('../authenticate');

    await authenticate(new Request('https://links.example.test/api/pages'), { requireScopes: ['links:write'] });

    expect(requireSessionOrAppTokenMock).toHaveBeenCalledWith(expect.anything(), {
      aud: 'links.example.test',
      requireScopes: ['links:write'],
    });
  });
});
