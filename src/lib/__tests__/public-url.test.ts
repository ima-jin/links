import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicPageUrl } from '../public-url';

describe('publicPageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['dev base path', 'https://dev.example.test/links', 'veteze', 'https://dev.example.test/links/veteze'],
    ['prod base path', 'https://prod.example.test/links', 'jin', 'https://prod.example.test/links/jin'],
    ['trailing slash', 'https://dev.example.test/links/', 'veteze', 'https://dev.example.test/links/veteze'],
    ['root-mounted base', 'http://localhost:3102', 'veteze', 'http://localhost:3102/veteze'],
    ['query and hash on the base', 'https://dev.example.test/links?x=1#frag', 'veteze', 'https://dev.example.test/links/veteze'],
    ['handle needing encoding', 'https://dev.example.test/links', 'a/b c', 'https://dev.example.test/links/a%2Fb%20c'],
  ])('%s', (_name, appUrl, handle, expected) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl);
    expect(publicPageUrl(handle)).toBe(expected);
  });

  it.each([
    ['unset or empty (no fallback host)', '', /is not set/],
    ['not a URL', 'not a url', /not a valid URL/],
    ['not http(s)', 'ftp://dev.example.test/links', /http\(s\)/],
  ])('throws when NEXT_PUBLIC_APP_URL is %s', (_name, appUrl, message) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl);
    expect(() => publicPageUrl('veteze')).toThrow(message);
  });
});
