import { afterEach, expect, it, vi } from 'vitest';
import { APP_SLUG, authServiceUrl } from '../env';

afterEach(() => {
  vi.unstubAllEnvs();
});

it('APP_SLUG is the registry slug, never derived from NEXT_PUBLIC_APP_URL (imajin-ai#2706)', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dev-jin.imajin.ai/links');
  expect(APP_SLUG).toBe('links');
  expect(APP_SLUG).toMatch(/^[a-z][a-z0-9-]{0,38}$/);
});

it('authServiceUrl returns AUTH_SERVICE_URL and throws when it is unset', () => {
  vi.stubEnv('AUTH_SERVICE_URL', 'https://dev-jin.imajin.ai/auth');
  expect(authServiceUrl()).toBe('https://dev-jin.imajin.ai/auth');
  vi.stubEnv('AUTH_SERVICE_URL', '');
  expect(() => authServiceUrl()).toThrow(/AUTH_SERVICE_URL is not set/);
});
