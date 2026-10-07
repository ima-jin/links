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

function vaultKeySlot(): unknown {
  return (globalThis as { [VAULT_KEY_STATE]?: unknown })[VAULT_KEY_STATE];
}

function clearVaultKeySlot(): void {
  delete (globalThis as { [VAULT_KEY_STATE]?: unknown })[VAULT_KEY_STATE];
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

  it('resolves without a key and without touching the network when the LINKS_VAULT_BOOTSTRAP_* pair is unset', async () => {
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_DID', '');
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY', '');

    await expect(bootstrapInternalApiKey('links')).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(vaultKeySlot()).toBeUndefined();
  });

  it('requires both halves of the identity pair', async () => {
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_DID', 'did:imajin:links-bootstrap-under-test');
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY', '');

    await expect(bootstrapInternalApiKey('links')).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(vaultKeySlot()).toBeUndefined();
  });

  it('does not adopt a hand-set ATTESTATION_INTERNAL_API_KEY when the pair is unset', async () => {
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_DID', '');
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY', '');
    vi.stubEnv('ATTESTATION_INTERNAL_API_KEY', 'hand-set-placeholder');

    await bootstrapInternalApiKey('links');

    expect(vaultKeySlot()).toBeUndefined();
  });

  it('resolves and leaves the key unset when the vault fetch fails', async () => {
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_DID', 'did:imajin:links-bootstrap-under-test');
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY', 'not-a-real-key-placeholder');
    vi.stubEnv('IMAJIN_KERNEL_URL', 'https://kernel.invalid');
    vi.stubEnv('AUTH_SERVICE_URL', 'https://kernel.invalid/auth');

    await expect(bootstrapInternalApiKey('links')).resolves.toBeUndefined();

    expect(vaultKeySlot()).toBeUndefined();
  });
});
