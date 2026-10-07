import { afterEach, expect, it, vi } from 'vitest';
import { thisAppHost } from '../env';

afterEach(() => {
  vi.unstubAllEnvs();
});

it('thisAppHost returns the host of NEXT_PUBLIC_APP_URL', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dev.example.test/links');
  expect(thisAppHost()).toBe('dev.example.test');
});

it.each([
  ['unset', '', /is not set/],
  ['invalid', 'not a url', /not a valid URL/],
])('thisAppHost throws instead of falling back when NEXT_PUBLIC_APP_URL is %s', (_name, appUrl, message) => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl);
  expect(() => thisAppHost()).toThrow(message);
});
