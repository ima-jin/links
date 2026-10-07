import { afterEach, describe, expect, it, vi } from 'vitest';

const { bootstrapSigningIdentityMock, bootstrapInternalApiKeyMock } = vi.hoisted(() => ({
  bootstrapSigningIdentityMock: vi.fn(),
  bootstrapInternalApiKeyMock: vi.fn(),
}));

vi.mock('@/lib/auth/signing-identity', () => ({
  bootstrapSigningIdentity: bootstrapSigningIdentityMock,
}));

vi.mock('@ima-jin/auth', () => ({
  bootstrapInternalApiKey: bootstrapInternalApiKeyMock,
}));

describe('validateSigningKeyBootEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    bootstrapSigningIdentityMock.mockReset();
  });

  it('fails loud when a raw private key is still set, pointing at the new flow', async () => {
    vi.stubEnv('IMAJIN_APP_PRIVATE_KEY', 'raw-key-that-should-not-be-here');
    vi.stubEnv('IMAJIN_APP_DID', 'did:imajin:app-under-test');
    const { validateSigningKeyBootEnv } = await import('../instrumentation');

    expect(() => validateSigningKeyBootEnv()).toThrow(/IMAJIN_APP_PRIVATE_KEY/);
    expect(() => validateSigningKeyBootEnv()).toThrow(/loadAppSigningKey/);
  });

  it('fails loud when IMAJIN_APP_DID is not set', async () => {
    vi.stubEnv('IMAJIN_APP_PRIVATE_KEY', '');
    vi.stubEnv('IMAJIN_APP_DID', '');
    const { validateSigningKeyBootEnv } = await import('../instrumentation');

    expect(() => validateSigningKeyBootEnv()).toThrow(/IMAJIN_APP_DID is not set/);
  });

  it('passes when neither guard trips', async () => {
    vi.stubEnv('IMAJIN_APP_PRIVATE_KEY', '');
    vi.stubEnv('IMAJIN_APP_DID', 'did:imajin:app-under-test');
    const { validateSigningKeyBootEnv } = await import('../instrumentation');

    expect(() => validateSigningKeyBootEnv()).not.toThrow();
  });
});

describe('register', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    bootstrapSigningIdentityMock.mockReset();
    bootstrapInternalApiKeyMock.mockReset();
  });

  it('skips validation and bootstrap outside the nodejs runtime (e.g. edge)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const { register } = await import('../instrumentation');

    await expect(register()).resolves.toBeUndefined();
    expect(bootstrapSigningIdentityMock).not.toHaveBeenCalled();
    expect(bootstrapInternalApiKeyMock).not.toHaveBeenCalled();
  });

  it('bootstraps the signing identity once the boot env is valid', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('IMAJIN_APP_PRIVATE_KEY', '');
    vi.stubEnv('IMAJIN_APP_DID', 'did:imajin:app-under-test');
    bootstrapSigningIdentityMock.mockResolvedValue(undefined);
    const { register } = await import('../instrumentation');

    await register();

    expect(bootstrapSigningIdentityMock).toHaveBeenCalledTimes(1);
  });

  it('fetches the vault-sourced internal API key for `links` right after the signing identity', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('IMAJIN_APP_PRIVATE_KEY', '');
    vi.stubEnv('IMAJIN_APP_DID', 'did:imajin:app-under-test');
    bootstrapSigningIdentityMock.mockResolvedValue(undefined);
    bootstrapInternalApiKeyMock.mockResolvedValue(undefined);
    const { register } = await import('../instrumentation');

    await register();

    expect(bootstrapInternalApiKeyMock).toHaveBeenCalledTimes(1);
    expect(bootstrapInternalApiKeyMock).toHaveBeenCalledWith('links');
    expect(bootstrapSigningIdentityMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapInternalApiKeyMock.mock.invocationCallOrder[0],
    );
  });

  it('boots (unclaimed mode included) when the helper reports a missing identity or grant by resolving', async () => {
    // bootstrapInternalApiKey never throws: a missing LINKS_VAULT_BOOTSTRAP_* pair, a
    // missing vault grant or a failed fetch is logged and leaves the key unset.
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('IMAJIN_APP_PRIVATE_KEY', '');
    vi.stubEnv('IMAJIN_APP_DID', 'did:imajin:app-under-test');
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_DID', '');
    vi.stubEnv('LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY', '');
    bootstrapSigningIdentityMock.mockResolvedValue(undefined);
    bootstrapInternalApiKeyMock.mockResolvedValue(undefined);
    const { register } = await import('../instrumentation');

    await expect(register()).resolves.toBeUndefined();
    expect(bootstrapInternalApiKeyMock).toHaveBeenCalledWith('links');
  });

  it('does not fetch the key when the boot env is invalid', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('IMAJIN_APP_PRIVATE_KEY', '');
    vi.stubEnv('IMAJIN_APP_DID', '');
    const { register } = await import('../instrumentation');

    await expect(register()).rejects.toThrow(/IMAJIN_APP_DID is not set/);
    expect(bootstrapSigningIdentityMock).not.toHaveBeenCalled();
    expect(bootstrapInternalApiKeyMock).not.toHaveBeenCalled();
  });

  it('propagates a real signing-identity failure without fetching the key', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('IMAJIN_APP_PRIVATE_KEY', '');
    vi.stubEnv('IMAJIN_APP_DID', 'did:imajin:app-under-test');
    bootstrapSigningIdentityMock.mockRejectedValue(new Error('kernel refused the claim code'));
    const { register } = await import('../instrumentation');

    await expect(register()).rejects.toThrow(/kernel refused the claim code/);
    expect(bootstrapInternalApiKeyMock).not.toHaveBeenCalled();
  });
});
