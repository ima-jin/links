import { requireSessionOrAppToken } from '@ima-jin/auth';
import { APP_SLUG } from '@/lib/env';

/**
 * This app's entire inbound-auth surface, deliberately funneled through one
 * function. Every route calls `authenticate(request)` and nothing else — no
 * route imports `@ima-jin/auth`'s `requireSessionOrAppToken` (or any other
 * auth primitive) directly. Mirrors `ima-jin/dykil`'s
 * `src/lib/auth/authenticate.ts` (same explicit product decision, #1974
 * reference adoption of the #1069 Phase 1 scoped app-token) so a future
 * change to the underlying mechanism is a one-file change, not a
 * route-by-route migration.
 *
 * The token audience is this app's registry slug (`links`), never the shared
 * host (imajin-ai#2706); `IMAJIN_APP_AUD` overrides it inside `@ima-jin/auth`.
 * A Bearer that fails verification is a 401 — it never falls back to the cookie.
 *
 * `requireSessionOrAppToken` accepts EITHER a scoped
 * `Authorization: Bearer <app-token>` OR the shared kernel session cookie as
 * a fallback. The cookie path works here because this app is Caddy-routed
 * same-origin under the kernel host (a `/links` path prefix, not a separate
 * subdomain) — the exact mechanism the original in-monorepo `apps/links`
 * relied on, now reached through the published SDK instead of a
 * workspace-internal one.
 */
export interface AuthenticatedCaller {
  /** DID of the authenticated caller. */
  did: string;
  /** Capability scopes granted to this call (empty on the cookie fallback path). */
  scopes: string[];
  /** Which path authenticated this request — surfaced for logging/debugging only. */
  via: 'token' | 'cookie';
}

export type AuthenticateSuccess = { auth: AuthenticatedCaller };
export type AuthenticateFailure = { error: string; status: number };
export type AuthenticateResult = AuthenticateSuccess | AuthenticateFailure;

export interface AuthenticateOptions {
  requireScopes?: string[];
}

export async function authenticate(request: Request, options?: AuthenticateOptions): Promise<AuthenticateResult> {
  const result = await requireSessionOrAppToken(request, {
    slug: APP_SLUG,
    requireScopes: options?.requireScopes,
  });
  if ('error' in result) {
    return { error: result.error, status: result.status };
  }
  return { auth: result.auth };
}
