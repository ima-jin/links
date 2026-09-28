import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfileDefaults } from '../profile';

describe('fetchProfileDefaults', () => {
  beforeEach(() => {
    vi.stubEnv('IMAJIN_KERNEL_URL', 'https://dev-jin.imajin.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns null when IMAJIN_KERNEL_URL is not set', async () => {
    vi.stubEnv('IMAJIN_KERNEL_URL', '');

    const result = await fetchProfileDefaults('did:imajin:owner');

    expect(result).toBeNull();
  });

  it('returns the handle/displayName on a successful lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ handle: 'jin', displayName: 'Jin' }), { status: 200 })),
    );

    const result = await fetchProfileDefaults('did:imajin:owner');

    expect(result).toEqual({ handle: 'jin', displayName: 'Jin' });
  });

  it('falls back to `name` when displayName is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ handle: 'jin', name: 'Jin' }), { status: 200 })));

    const result = await fetchProfileDefaults('did:imajin:owner');

    expect(result).toEqual({ handle: 'jin', displayName: 'Jin' });
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

    const result = await fetchProfileDefaults('did:imajin:owner');

    expect(result).toBeNull();
  });

  it('returns null (never throws) on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(fetchProfileDefaults('did:imajin:owner')).resolves.toBeNull();
  });
});
