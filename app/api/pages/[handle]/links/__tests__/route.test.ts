import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chainable } from '@/test/drizzle-test-utils';

const { authenticateMock, findFirstMock, selectMock, insertMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  findFirstMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock('@/lib/auth/authenticate', () => ({ authenticate: authenticateMock }));
vi.mock('@/db', () => ({
  db: {
    query: { linkPages: { findFirst: findFirstMock } },
    select: selectMock,
    insert: insertMock,
  },
  linkPages: {},
  links: {},
}));

const params = Promise.resolve({ handle: 'jin' });

function postRequest(body: unknown) {
  return new NextRequest('https://links.example.test/api/pages/jin/links', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/pages/:handle/links', () => {
  beforeEach(() => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockReset();
    selectMock.mockReset();
    insertMock.mockReset();
  });

  it('returns 404 when the page does not exist', async () => {
    findFirstMock.mockResolvedValue(null);
    const { POST } = await import('../route');

    const response = await POST(postRequest({ links: [{ title: 'GitHub', url: 'https://github.com' }] }), { params });

    expect(response.status).toBe(404);
  });

  it('returns 403 when the caller is not the owner', async () => {
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:someone-else' });
    const { POST } = await import('../route');

    const response = await POST(postRequest({ links: [{ title: 'GitHub', url: 'https://github.com' }] }), { params });

    expect(response.status).toBe(403);
  });

  it('requires a non-empty links array', async () => {
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    const { POST } = await import('../route');

    const response = await POST(postRequest({ links: [] }), { params });

    expect(response.status).toBe(400);
  });

  it('rejects a link missing a title or with an invalid URL', async () => {
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    selectMock.mockReturnValue(chainable([{ maxPos: 0 }]));
    const { POST } = await import('../route');

    const missingTitle = await POST(postRequest({ links: [{ url: 'https://github.com' }] }), { params });
    expect(missingTitle.status).toBe(400);

    const invalidUrl = await POST(postRequest({ links: [{ title: 'GitHub', url: 'not-a-url' }] }), { params });
    expect(invalidUrl.status).toBe(400);
  });

  it('inserts links positioned after the current max', async () => {
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    selectMock.mockReturnValue(chainable([{ maxPos: 2 }]));
    const inserted = [{ id: 'link_1', title: 'GitHub', url: 'https://github.com', position: 3 }];
    insertMock.mockReturnValue({ values: () => chainable(inserted) });
    const { POST } = await import('../route');

    const response = await POST(postRequest({ links: [{ title: 'GitHub', url: 'https://github.com' }] }), { params });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ links: inserted });
  });
});
