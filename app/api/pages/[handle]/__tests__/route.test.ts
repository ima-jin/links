import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chainable } from '@/test/drizzle-test-utils';

const { authenticateMock, findFirstMock, selectMock, updateMock, deleteMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  findFirstMock: vi.fn(),
  selectMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('@/lib/auth/authenticate', () => ({ authenticate: authenticateMock }));
vi.mock('@/db', () => ({
  db: {
    query: { linkPages: { findFirst: findFirstMock } },
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
  },
  linkPages: {},
  links: {},
}));

const params = Promise.resolve({ handle: 'jin' });

describe('GET /api/pages/:handle', () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    selectMock.mockReset();
  });

  it('returns 404 when the page does not exist', async () => {
    findFirstMock.mockResolvedValue(null);
    const { GET } = await import('../route');

    const response = await GET(new NextRequest('https://links.imajin.ai/api/pages/jin'), { params });

    expect(response.status).toBe(404);
  });

  it('returns 403 for a private page', async () => {
    findFirstMock.mockResolvedValue({ id: 'page_1', isPublic: false });
    const { GET } = await import('../route');

    const response = await GET(new NextRequest('https://links.imajin.ai/api/pages/jin'), { params });

    expect(response.status).toBe(403);
  });

  it('returns the page with its active links', async () => {
    findFirstMock.mockResolvedValue({ id: 'page_1', isPublic: true, handle: 'jin' });
    selectMock.mockReturnValue(chainable([{ id: 'link_1' }]));
    const { GET } = await import('../route');

    const response = await GET(new NextRequest('https://links.imajin.ai/api/pages/jin'), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.links).toEqual([{ id: 'link_1' }]);
  });
});

describe('PUT /api/pages/:handle', () => {
  beforeEach(() => {
    authenticateMock.mockReset();
    findFirstMock.mockReset();
    updateMock.mockReset();
  });

  function putRequest(body: unknown) {
    return new NextRequest('https://links.imajin.ai/api/pages/jin', { method: 'PUT', body: JSON.stringify(body) });
  }

  it('returns 401 when not authenticated', async () => {
    authenticateMock.mockResolvedValue({ error: 'Not authenticated', status: 401 });
    const { PUT } = await import('../route');

    const response = await PUT(putRequest({ title: 'New' }), { params });

    expect(response.status).toBe(401);
  });

  it('returns 404 when the page does not exist', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue(null);
    const { PUT } = await import('../route');

    const response = await PUT(putRequest({ title: 'New' }), { params });

    expect(response.status).toBe(404);
  });

  it('returns 403 when the caller is not the owner', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:someone-else', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    const { PUT } = await import('../route');

    const response = await PUT(putRequest({ title: 'New' }), { params });

    expect(response.status).toBe(403);
  });

  it('updates the page for its owner', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    updateMock.mockReturnValue({ set: () => ({ where: () => chainable([{ id: 'page_1', title: 'New' }]) }) });
    const { PUT } = await import('../route');

    const response = await PUT(putRequest({ title: 'New' }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.title).toBe('New');
  });
});

describe('DELETE /api/pages/:handle', () => {
  beforeEach(() => {
    authenticateMock.mockReset();
    findFirstMock.mockReset();
    deleteMock.mockReset();
  });

  function deleteRequest() {
    return new NextRequest('https://links.imajin.ai/api/pages/jin', { method: 'DELETE' });
  }

  it('returns 403 when the caller is not the owner', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:someone-else', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    const { DELETE } = await import('../route');

    const response = await DELETE(deleteRequest(), { params });

    expect(response.status).toBe(403);
  });

  it('deletes the page for its owner', async () => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    deleteMock.mockReturnValue(chainable(undefined));
    const { DELETE } = await import('../route');

    const response = await DELETE(deleteRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ deleted: true });
  });
});
