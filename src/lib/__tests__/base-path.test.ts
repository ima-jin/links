import { afterEach, describe, expect, it, vi } from 'vitest';
import { withBasePath } from '../base-path';

describe('withBasePath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to /links when NEXT_PUBLIC_BASE_PATH is unset', () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    expect(withBasePath('/claim')).toBe('/links/claim');
    expect(withBasePath('/')).toBe('/links');
  });

  it('honours an explicit NEXT_PUBLIC_BASE_PATH, including the empty root', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/other');
    expect(withBasePath('/api/claim')).toBe('/other/api/claim');

    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    expect(withBasePath('/api/claim')).toBe('/api/claim');
  });
});
