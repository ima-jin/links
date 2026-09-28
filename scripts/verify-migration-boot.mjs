#!/usr/bin/env node
/**
 * Proves this app actually boots (`next start`, a real HTTP server, a real
 * `/api/health` round-trip) against a freshly migrated database — not just
 * that `drizzle-kit migrate` exits 0.
 *
 * This app's boot path (`instrumentation.ts`) needs a live kernel to fetch
 * its signing key (`@ima-jin/auth-client`'s `loadAppSigningKey()`), which no
 * CI environment has. Rather than skip the boot check entirely, this script
 * stands up a tiny local stub server answering the ONE endpoint first boot
 * calls (`POST /api/apps/claim`) with a canned key pair, so the app's own
 * boot contract is satisfied for real, end to end.
 *
 * Requires: `pnpm build` already run, and `DATABASE_URL`/`APP_DB_SCHEMA`
 * already pointing at a migrated database (see .github/workflows/ci.yml).
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BOOT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1000;

function startStubKernel() {
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/apps/claim') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          appDid: 'did:imajin:verify-migration-boot',
          privateKey: 'stub-private-key-hex',
          publicKey: 'stub-public-key-hex',
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitForHealthy(url, deadline) {
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (response.status === 200 && body.status === 'ok' && body.service === 'links') {
        return body;
      }
      lastError = new Error(`Unexpected /api/health response: ${response.status} ${JSON.stringify(body)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw lastError ?? new Error('Timed out waiting for /api/health');
}

async function main() {
  const stubKernel = await startStubKernel();
  const keystoreDir = await mkdtemp(join(tmpdir(), 'links-boot-verify-'));
  const keystorePath = join(keystoreDir, 'keystore.json');
  const appPort = process.env.VERIFY_BOOT_PORT ?? '4102';

  const env = {
    ...process.env,
    PORT: appPort,
    IMAJIN_APP_PRIVATE_KEY: '',
    // instrumentation.ts's validateSigningKeyBootEnv() requires this to be
    // merely present before the claim exchange even runs; the value itself
    // is unused here (no keystore exists yet, so bootstrapSigningIdentity()
    // resolves the real DID from the stub kernel's claim response instead).
    IMAJIN_APP_DID: 'did:imajin:verify-boot-placeholder',
    IMAJIN_KERNEL_URL: `http://127.0.0.1:${stubKernel.address().port}`,
    IMAJIN_APP_CLAIM_CODE: 'verify-boot-claim-code',
    IMAJIN_APP_KEYSTORE: keystorePath,
  };

  const child = spawn('node_modules/.bin/next', ['start', '-p', appPort], { env, stdio: 'inherit' });

  const cleanup = async () => {
    child.kill('SIGTERM');
    await new Promise((resolve) => stubKernel.close(resolve));
    await rm(keystoreDir, { recursive: true, force: true });
  };

  try {
    const body = await waitForHealthy(`http://127.0.0.1:${appPort}/api/health`, Date.now() + BOOT_TIMEOUT_MS);
    console.log('Boot verification passed — /api/health:', body);
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('Boot verification failed:', error);
  process.exitCode = 1;
});
