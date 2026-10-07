import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chainable } from '@/test/drizzle-test-utils';

const { authenticateMock, findFirstMock, selectMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  findFirstMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock('@/lib/auth/authenticate', () => ({ authenticate: authenticateMock }));
vi.mock('@/db', () => ({
  db: {
    query: { linkPages: { findFirst: findFirstMock } },
    select: selectMock,
  },
  linkPages: {},
  links: {},
}));

function getRequest() {
  return new NextRequest('https://links.example.test/api/pages/mine');
}

describe('GET /api/pages/mine', () => {
  beforeEach(() => {
    authenticateMock.mockReset();
    findFirstMock.mockReset();
    selectMock.mockReset();
  });

  it('returns 401 when not authenticated', async () => {
    authenticateMock.mockResolvedValue({ error: 'Not authenticated', status: 401 });
    const { GET } = await import('../route');

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
  });

  it('returns { page: null } when the caller has no page yet', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue(null);
    const { GET } = await import('../route');

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ page: null });
  });

  it("returns the caller's page with its links", async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    const page = { id: 'page_1', did: 'did:imajin:owner', handle: 'jin' };
    findFirstMock.mockResolvedValue(page);
    const pageLinks = [{ id: 'link_1', title: 'GitHub' }];
    selectMock.mockReturnValue(chainable(pageLinks));
    const { GET } = await import('../route');

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ...page, links: pageLinks });
  });
});
