import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateMock, findFirstMock, insertMock, fetchProfileDefaultsMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  findFirstMock: vi.fn(),
  insertMock: vi.fn(),
  fetchProfileDefaultsMock: vi.fn(),
}));

vi.mock('@/lib/auth/authenticate', () => ({ authenticate: authenticateMock }));
vi.mock('@/lib/kernel/profile', () => ({ fetchProfileDefaults: fetchProfileDefaultsMock }));
vi.mock('@/db', () => ({
  db: {
    query: { linkPages: { findFirst: findFirstMock } },
    insert: insertMock,
  },
  linkPages: {},
}));

function postRequest() {
  return new NextRequest('https://links.example.test/api/pages/auto-create', { method: 'POST' });
}

describe('POST /api/pages/auto-create', () => {
  beforeEach(() => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:abcdef123456', scopes: [], via: 'token' } });
    findFirstMock.mockReset();
    insertMock.mockReset();
    fetchProfileDefaultsMock.mockReset();
  });

  it('returns 401 when not authenticated', async () => {
    authenticateMock.mockResolvedValue({ error: 'Not authenticated', status: 401 });
    const { POST } = await import('../route');

    const response = await POST(postRequest());

    expect(response.status).toBe(401);
  });

  it('returns 409 when the caller already has a page', async () => {
    findFirstMock.mockResolvedValue({ id: 'page_existing' });
    const { POST } = await import('../route');

    const response = await POST(postRequest());

    expect(response.status).toBe(409);
  });

  it('uses the public profile handle/display name when available', async () => {
    findFirstMock.mockResolvedValue(null);
    fetchProfileDefaultsMock.mockResolvedValue({ handle: 'jin', displayName: 'Jin' });
    const created = { id: 'page_new', handle: 'jin', title: 'Jin' };
    insertMock.mockReturnValue({ values: (values: { handle: string; title: string }) => ({
      returning: async () => [{ ...created, ...values }],
    }) });
    const { POST } = await import('../route');

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.handle).toBe('jin');
    expect(body.title).toBe('Jin');
  });

  it('falls back to a DID-derived handle when the profile lookup fails', async () => {
    findFirstMock.mockResolvedValue(null);
    fetchProfileDefaultsMock.mockResolvedValue(null);
    insertMock.mockReturnValue({
      values: (values: { handle: string; title: string }) => ({ returning: async () => [values] }),
    });
    const { POST } = await import('../route');

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.handle).toBe('did:imajin:abcdef123456'.slice(-12));
    expect(body.title).toBe(body.handle);
  });
});
