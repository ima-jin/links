import { bootstrapSigningIdentity } from '@/lib/auth/signing-identity';

/**
 * Next.js instrumentation hook (stable since Next 15) — runs once when the
 * server process starts, before it serves any request. Not invoked by
 * `next build`, so CI builds are not gated on runtime secrets.
 *
 * This app is registered with the Imajin kernel (see docs/REGISTRATION.md)
 * and is identified by its own DID. It never reads a raw private key out of
 * an env file — its signing key comes from `@ima-jin/auth-client`'s
 * `loadAppSigningKey()` boot path (one-time claim code on first boot, local
 * bootstrap keystore on every later boot; see #7 and docs/REGISTRATION.md).
 * Refusing to boot on a misconfigured env catches the problem immediately
 * instead of serving requests no kernel call could ever authenticate.
 *
 * This app's `middleware.ts` (claim-state gate, #2427) runs on the Node.js
 * middleware runtime, never Edge (see next.config.js's `redirects()` for why
 * the `/dashboard` redirect isn't middleware) — `@ima-jin/auth-client`'s
 * signing-key boot path uses Node builtins (crypto/fs/path) that don't exist
 * under the Edge runtime.
 *
 * With neither a keystore nor `IMAJIN_APP_CLAIM_CODE`, `bootstrapSigningIdentity()`
 * returns without throwing (unclaimed boot mode, #2427) and an operator claims
 * this app at `<app>/claim`.
 *
 * It also fetches the vault-sourced `ATTESTATION_INTERNAL_API_KEY` (imajin-ai#2455,
 * #2468) that `@ima-jin/auth`'s kernel-internal calls authenticate with, via
 * `bootstrapInternalApiKey('links')` using this app's
 * `LINKS_VAULT_BOOTSTRAP_DID` / `LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY` identity.
 * The key is held in memory by `@ima-jin/auth` (never `process.env`), and the
 * helper never throws: a missing identity, a missing vault grant or a failed
 * fetch is logged as an error and leaves the key unset, so kernel-internal
 * calls fail closed instead of crashing boot. It is imported dynamically so
 * `@ima-jin/auth` stays out of any non-Node.js instrumentation bundle, and it
 * runs in unclaimed boot mode too — it does not depend on the signing key.
 */
export function validateSigningKeyBootEnv(): void {
  if (process.env.IMAJIN_APP_PRIVATE_KEY) {
    throw new Error(
      'IMAJIN_APP_PRIVATE_KEY is set, but this app no longer reads a raw signing key from env. ' +
        "Remove it — loadAppSigningKey() now bootstraps this app's identity from a one-time claim " +
        'code and a local keystore instead. See docs/REGISTRATION.md and @ima-jin/auth-client\'s ' +
        'README ("Fetch this app\'s own signing key at boot").'
    );
  }

  if (!process.env.IMAJIN_APP_DID) {
    throw new Error(
      'IMAJIN_APP_DID is not set. Register this app with the kernel first — see docs/REGISTRATION.md.'
    );
  }
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  validateSigningKeyBootEnv();
  await bootstrapSigningIdentity();

  const { bootstrapInternalApiKey } = await import('@ima-jin/auth');
  await bootstrapInternalApiKey('links');
}
