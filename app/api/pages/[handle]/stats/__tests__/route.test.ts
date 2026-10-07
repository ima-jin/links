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
  linkClicks: {},
}));

const params = Promise.resolve({ handle: 'jin' });

function getRequest() {
  return new NextRequest('https://links.example.test/api/pages/jin/stats');
}

describe('GET /api/pages/:handle/stats', () => {
  beforeEach(() => {
    authenticateMock.mockReset();
    findFirstMock.mockReset();
    selectMock.mockReset();
  });

  it('returns 401 when not authenticated', async () => {
    authenticateMock.mockResolvedValue({ error: 'Not authenticated', status: 401 });
    const { GET } = await import('../route');

    const response = await GET(getRequest(), { params });

    expect(response.status).toBe(401);
  });

  it('returns 403 when the caller is not the owner', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:someone-else', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    const { GET } = await import('../route');

    const response = await GET(getRequest(), { params });

    expect(response.status).toBe(403);
  });

  it('returns zeroed stats when the page has no links yet', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    selectMock.mockReturnValue(chainable([]));
    const { GET } = await import('../route');

    const response = await GET(getRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ totalClicks: 0, clicksByLink: [], clicksByDay: [], topReferrers: [] });
  });

  it('aggregates totals, daily clicks, and top referrers when links exist', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });

    const pageLinks = [{ id: 'link_1', title: 'GitHub', url: 'https://github.com', clicks: 5 }];
    const dailyClicks = [{ date: '2026-02-14', clicks: 3 }];
    const referrers = [{ referrer: 'twitter.com', clicks: 2 }];
    selectMock
      .mockReturnValueOnce(chainable(pageLinks))
      .mockReturnValueOnce(chainable(dailyClicks))
      .mockReturnValueOnce(chainable(referrers));

    const { GET } = await import('../route');

    const response = await GET(getRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalClicks).toBe(5);
    expect(body.clicksByLink).toEqual([{ id: 'link_1', title: 'GitHub', url: 'https://github.com', clicks: 5 }]);
    expect(body.clicksByDay).toEqual([{ date: '2026-02-14', clicks: 3 }]);
    expect(body.topReferrers).toEqual([{ referrer: 'twitter.com', clicks: 2 }]);
  });
});
