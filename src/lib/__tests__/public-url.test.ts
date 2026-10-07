import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicPageUrl } from '../public-url';

describe('publicPageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the /links base path: dev', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dev.example.test/links');
    expect(publicPageUrl('veteze')).toBe('https://dev.example.test/links/veteze');
  });

  it('keeps the /links base path: prod', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prod.example.test/links');
    expect(publicPageUrl('jin')).toBe('https://prod.example.test/links/jin');
  });

  it('does not double the slash when the base has a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dev.example.test/links/');
    expect(publicPageUrl('veteze')).toBe('https://dev.example.test/links/veteze');
  });

  it('works for a root-mounted base (no path)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3102');
    expect(publicPageUrl('veteze')).toBe('http://localhost:3102/veteze');
  });

  it('drops any query or hash on the configured base', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dev.example.test/links?x=1#frag');
    expect(publicPageUrl('veteze')).toBe('https://dev.example.test/links/veteze');
  });

  it('encodes the handle as a single path segment', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dev.example.test/links');
    expect(publicPageUrl('a/b c')).toBe('https://dev.example.test/links/a%2Fb%20c');
  });

  it('throws when NEXT_PUBLIC_APP_URL is unset or empty — no fallback host', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(() => publicPageUrl('veteze')).toThrow(/NEXT_PUBLIC_APP_URL is not set/);
  });

  it('throws when NEXT_PUBLIC_APP_URL is not a URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not a url');
    expect(() => publicPageUrl('veteze')).toThrow(/not a valid URL/);
  });

  it('throws when NEXT_PUBLIC_APP_URL is not http(s)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'ftp://dev.example.test/links');
    expect(() => publicPageUrl('veteze')).toThrow(/http\(s\)/);
  });
});
