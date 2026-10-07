import { afterEach, describe, expect, it, vi } from 'vitest';
import { thisAppHost } from '../env';

describe('thisAppHost', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the host of NEXT_PUBLIC_APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dev.example.test/links');
    expect(thisAppHost()).toBe('dev.example.test');
  });

  it('throws instead of falling back when NEXT_PUBLIC_APP_URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(() => thisAppHost()).toThrow(/NEXT_PUBLIC_APP_URL is not set/);
  });

  it('throws instead of falling back when NEXT_PUBLIC_APP_URL is invalid', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not a url');
    expect(() => thisAppHost()).toThrow(/not a valid URL/);
  });
});
