/**
 * Central env-var accessors. `.env.example` is the contract (AGENTS.md §5) —
 * no hard-coded kernel URLs anywhere else in this app.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see .env.example.`);
  }
  return value;
}

/** Base URL of the kernel's auth service, e.g. https://dev-jin.imajin.ai/auth. */
export function authServiceUrl(): string {
  return required('AUTH_SERVICE_URL');
}

/** This app's own host, used as the `aud` for scoped app-token verification. */
export function thisAppHost(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return 'links.imajin.ai';
  try {
    return new URL(base).host;
  } catch {
    return 'links.imajin.ai';
  }
}
