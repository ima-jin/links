import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireSessionOrAppTokenMock } = vi.hoisted(() => ({ requireSessionOrAppTokenMock: vi.fn() }));

vi.mock('@ima-jin/auth', () => ({
  requireSessionOrAppToken: requireSessionOrAppTokenMock,
}));

describe('authenticate', () => {
  beforeEach(() => {
    requireSessionOrAppTokenMock.mockReset();
    process.env.NEXT_PUBLIC_APP_URL = 'https://links.imajin.ai';
  });

  it("scopes the audience to this app's registry slug, never its host (imajin-ai#2706)", async () => {
    requireSessionOrAppTokenMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    const { authenticate } = await import('../authenticate');

    const request = new Request('https://links.imajin.ai/api/pages');
    const result = await authenticate(request);

    expect(requireSessionOrAppTokenMock).toHaveBeenCalledWith(request, { slug: 'links', requireScopes: undefined });
    expect('auth' in result && result.auth.did).toBe('did:imajin:owner');
  });

  it('never derives the audience from the app URL host', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dev-jin.imajin.ai/links';
    requireSessionOrAppTokenMock.mockResolvedValue({ error: 'x', status: 401 });
    const { authenticate } = await import('../authenticate');

    await authenticate(new Request('https://dev-jin.imajin.ai/links/api/pages'));

    const options = requireSessionOrAppTokenMock.mock.calls[0][1] as Record<string, unknown>;
    expect(options.slug).toBe('links');
    expect(options).not.toHaveProperty('aud');
  });

  it('forwards a failure as { error, status }', async () => {
    requireSessionOrAppTokenMock.mockResolvedValue({ error: 'Not authenticated', status: 401 });
    const { authenticate } = await import('../authenticate');

    const result = await authenticate(new Request('https://links.imajin.ai/api/pages'));

    expect(result).toEqual({ error: 'Not authenticated', status: 401 });
  });

  it('forwards requireScopes through to the underlying check', async () => {
    requireSessionOrAppTokenMock.mockResolvedValue({ error: 'Missing required scope(s): links:write', status: 403 });
    const { authenticate } = await import('../authenticate');

    await authenticate(new Request('https://links.imajin.ai/api/pages'), { requireScopes: ['links:write'] });

    expect(requireSessionOrAppTokenMock).toHaveBeenCalledWith(expect.anything(), {
      slug: 'links',
      requireScopes: ['links:write'],
    });
  });
});
