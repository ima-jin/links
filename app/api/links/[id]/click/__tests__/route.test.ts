import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chainable } from '@/test/drizzle-test-utils';

const { selectMock, insertMock, updateMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: { select: selectMock, insert: insertMock, update: updateMock },
  links: {},
  linkClicks: {},
}));

const params = Promise.resolve({ id: 'link_1' });

function postRequest(headers: Record<string, string> = {}) {
  return new NextRequest('https://links.example.test/api/links/link_1/click', { method: 'POST', headers });
}

describe('POST /api/links/:id/click', () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    updateMock.mockReset();
  });

  it('returns 404 when the link does not exist', async () => {
    selectMock.mockReturnValue(chainable([]));
    const { POST } = await import('../route');

    const response = await POST(postRequest(), { params });

    expect(response.status).toBe(404);
  });

  it('records a click with only the referrer domain, never the full URL', async () => {
    selectMock.mockReturnValue(chainable([{ id: 'link_1' }]));
    insertMock.mockReturnValue({ values: vi.fn(() => chainable(undefined)) });
    updateMock.mockReturnValue({ set: () => ({ where: () => chainable(undefined) }) });
    const { POST } = await import('../route');

    const response = await POST(postRequest({ referer: 'https://example.com/some/deep/path' }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ recorded: true });
    expect(insertMock).toHaveBeenCalled();
    const valuesCall = insertMock.mock.results[0].value.values as ReturnType<typeof vi.fn>;
    expect(valuesCall).toHaveBeenCalledWith(expect.objectContaining({ referrer: 'example.com' }));
  });

  it('never fails the response even if recording the click throws', async () => {
    selectMock.mockReturnValue(chainable([{ id: 'link_1' }]));
    insertMock.mockImplementation(() => {
      throw new Error('db down');
    });
    const { POST } = await import('../route');

    const response = await POST(postRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ recorded: false });
  });
});
