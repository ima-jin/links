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

/**
 * This app's registry slug — the `aud` its scoped app tokens are minted for
 * (`registry.apps.token_audiences` holds slugs, which `apps.provision` writes).
 * NEVER derive the audience from this app's host: every path-routed app shares
 * `jin.imajin.ai` / `dev-jin.imajin.ai` (imajin-ai#2706). `@ima-jin/auth` also
 * honours an `IMAJIN_APP_AUD` override.
 */
export const APP_SLUG = 'links';
