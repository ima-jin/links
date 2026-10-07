import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chainable } from '@/test/drizzle-test-utils';

const { authenticateMock, findFirstMock, insertMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  findFirstMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock('@/lib/auth/authenticate', () => ({ authenticate: authenticateMock }));
vi.mock('@/db', () => ({
  db: {
    query: { linkPages: { findFirst: findFirstMock } },
    insert: insertMock,
  },
  linkPages: {},
}));

function postRequest(body: unknown) {
  return new NextRequest('https://links.imajin.ai/api/pages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/pages', () => {
  beforeEach(() => {
    authenticateMock.mockResolvedValue({ auth: { did: 'did:imajin:owner', scopes: [], via: 'token' } });
    findFirstMock.mockReset();
    insertMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    authenticateMock.mockResolvedValue({ error: 'Not authenticated', status: 401 });
    const { POST } = await import('../route');

    const response = await POST(postRequest({ handle: 'jin', title: 'Jin' }));

    expect(response.status).toBe(401);
  });

  it('requires a handle and a title', async () => {
    const { POST } = await import('../route');

    const missingHandle = await POST(postRequest({ title: 'Jin' }));
    expect(missingHandle.status).toBe(400);

    const missingTitle = await POST(postRequest({ handle: 'jin' }));
    expect(missingTitle.status).toBe(400);
  });

  it('rejects an invalid handle format', async () => {
    const { POST } = await import('../route');

    const response = await POST(postRequest({ handle: 'J!', title: 'Jin' }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/lowercase alphanumeric/);
  });

  it('returns 409 when the caller already has a page', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 'page_existing' });
    const { POST } = await import('../route');

    const response = await POST(postRequest({ handle: 'jin', title: 'Jin' }));

    expect(response.status).toBe(409);
  });

  it('returns 409 when the handle is already taken', async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'page_other' });
    const { POST } = await import('../route');

    const response = await POST(postRequest({ handle: 'jin', title: 'Jin' }));

    expect(response.status).toBe(409);
  });

  it('creates a page with the dark theme preset by default', async () => {
    findFirstMock.mockResolvedValue(null);
    const created = { id: 'page_new', did: 'did:imajin:owner', handle: 'jin', title: 'Jin' };
    insertMock.mockReturnValue({ values: () => chainable([created]) });
    const { POST } = await import('../route');

    const response = await POST(postRequest({ handle: 'jin', title: 'Jin' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(created);
  });
});
