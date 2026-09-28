import { createLogger } from '@ima-jin/logger';

const log = createLogger('links');

export interface ProfileDefaults {
  handle?: string;
  displayName?: string;
}

/**
 * Best-effort lookup of a DID's public handle/display name, via the
 * kernel's public `GET {kernel}/profile/api/profile/{did}` route (the same
 * one `@ima-jin/auth-client`'s callback handler already calls). Used only to
 * pre-fill a nicer default handle/title on auto-create — see
 * `app/api/pages/auto-create/route.ts`.
 *
 * `authenticate()`'s `AuthenticatedCaller` deliberately carries only
 * `{ did, scopes, via }` (no handle/name — unlike the old workspace-internal
 * `@imajin/auth`'s `Identity`), so this app can no longer get a handle/name
 * "for free" off the auth result. Returns `null` on any failure (network
 * error, 404, malformed body) — callers must fall back to a DID-derived
 * default rather than fail the whole request over an enrichment call.
 */
export async function fetchProfileDefaults(did: string): Promise<ProfileDefaults | null> {
  const kernelUrl = process.env.IMAJIN_KERNEL_URL;
  if (!kernelUrl) return null;

  try {
    const response = await fetch(`${kernelUrl}/profile/api/profile/${encodeURIComponent(did)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { handle?: string; displayName?: string; name?: string };
    return { handle: data.handle, displayName: data.displayName ?? data.name };
  } catch (error) {
    log.warn({ err: String(error), did }, 'Profile lookup failed — falling back to DID-derived defaults');
    return null;
  }
}
