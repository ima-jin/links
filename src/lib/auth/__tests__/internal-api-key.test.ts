import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapInternalApiKey } from '@ima-jin/auth';

/**
 * Failure modes of the published `bootstrapInternalApiKey()` as links relies on
 * it (refs imajin-ai#2455, #2468). Unlike __tests__/instrumentation.test.ts
 * (which mocks the helper to prove the wiring), this runs the REAL helper with
 * no network: it must resolve (boot never crashes) and must never leave a key
 * behind — a missing identity or a failed vault fetch means "key unset, kernel
 * calls fail closed", not an empty or env-sourced key.
 */

// Where @ima-jin/auth keeps the vault-sourced key (same slot for every bundle copy).
const VAULT_KEY_STATE = Symbol.for('@ima-jin/auth/vault-attestation-internal-api-key');

type VaultKeyHost = { [VAULT_KEY_STATE]?: unknown };

function vaultKeySlot(): unknown {
  return (globalThis as VaultKeyHost)[VAULT_KEY_STATE];
}

function clearVaultKeySlot(): void {
  delete (globalThis as VaultKeyHost)[VAULT_KEY_STATE];
}

function stubVaultPair(did: string, privateKey: string): void {
  vi.stubEnv('LINKS_VAULT_BOOTSTRAP_DID', did);
  vi.stubEnv('LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY', privateKey);
}

describe('bootstrapInternalApiKey (real helper, no network)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearVaultKeySlot();
    fetchMock = vi.fn(async () => {
      throw new Error('network is disabled in this test');
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearVaultKeySlot();
  });

  it.each([
    ['both halves are unset', '', ''],
    ['only the DID is set', 'did:imajin:links-bootstrap-under-test', ''],
    ['only the private key is set', '', 'not-a-real-key-placeholder'],
  ])('resolves with no key and no network call when %s', async (_case, did, privateKey) => {
    stubVaultPair(did, privateKey);
    // A hand-set value must not be adopted as a fallback.
    vi.stubEnv('ATTESTATION_INTERNAL_API_KEY', 'hand-set-placeholder');

    await expect(bootstrapInternalApiKey('links')).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(vaultKeySlot()).toBeUndefined();
  });

  it('resolves and leaves the key unset when the vault fetch fails', async () => {
    stubVaultPair('did:imajin:links-bootstrap-under-test', 'not-a-real-key-placeholder');
    vi.stubEnv('IMAJIN_KERNEL_URL', 'https://kernel.invalid');
    vi.stubEnv('AUTH_SERVICE_URL', 'https://kernel.invalid/auth');

    await expect(bootstrapInternalApiKey('links')).resolves.toBeUndefined();

    expect(vaultKeySlot()).toBeUndefined();
  });
});
