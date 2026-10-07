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

const params = Promise.resolve({ id: 'link_1' });

describe('PUT /api/links/:id', () => {
  beforeEach(() => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockReset();
    selectMock.mockReset();
    updateMock.mockReset();
  });

  function putRequest(body: unknown) {
    return new NextRequest('https://links.imajin.ai/api/links/link_1', { method: 'PUT', body: JSON.stringify(body) });
  }

  it('returns 404 when the link does not exist', async () => {
    selectMock.mockReturnValue(chainable([]));
    const { PUT } = await import('../route');

    const response = await PUT(putRequest({ title: 'New' }), { params });

    expect(response.status).toBe(404);
  });

  it('returns 403 when the caller does not own the link', async () => {
    selectMock.mockReturnValue(chainable([{ id: 'link_1', pageId: 'page_1' }]));
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:someone-else' });
    const { PUT } = await import('../route');

    const response = await PUT(putRequest({ title: 'New' }), { params });

    expect(response.status).toBe(403);
  });

  it('rejects an invalid URL', async () => {
    selectMock.mockReturnValue(chainable([{ id: 'link_1', pageId: 'page_1' }]));
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    const { PUT } = await import('../route');

    const response = await PUT(putRequest({ url: 'not-a-url' }), { params });

    expect(response.status).toBe(400);
  });

  it('updates the link for its owner', async () => {
    selectMock.mockReturnValue(chainable([{ id: 'link_1', pageId: 'page_1' }]));
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    updateMock.mockReturnValue({ set: () => ({ where: () => chainable([{ id: 'link_1', title: 'New' }]) }) });
    const { PUT } = await import('../route');

    const response = await PUT(putRequest({ title: 'New' }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.title).toBe('New');
  });
});

describe('DELETE /api/links/:id', () => {
  beforeEach(() => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockReset();
    selectMock.mockReset();
    deleteMock.mockReset();
  });

  function deleteRequest() {
    return new NextRequest('https://links.imajin.ai/api/links/link_1', { method: 'DELETE' });
  }

  it('returns 403 when the caller does not own the link', async () => {
    selectMock.mockReturnValue(chainable([{ id: 'link_1', pageId: 'page_1' }]));
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:someone-else' });
    const { DELETE } = await import('../route');

    const response = await DELETE(deleteRequest(), { params });

    expect(response.status).toBe(403);
  });

  it('deletes the link for its owner', async () => {
    selectMock.mockReturnValue(chainable([{ id: 'link_1', pageId: 'page_1' }]));
    findFirstMock.mockResolvedValue({ id: 'page_1', did: 'did:imajin:owner' });
    deleteMock.mockReturnValue(chainable(undefined));
    const { DELETE } = await import('../route');

    const response = await DELETE(deleteRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ deleted: true });
  });
});
