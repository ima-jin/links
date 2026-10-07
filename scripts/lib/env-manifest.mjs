/**
 * Single source of truth for every environment variable this app (or a
 * dependency it loads, or one of its scripts) reads — refs
 * ima-jin/imajin-ai#2490. The table is scripts/lib/env-vars.json; this module
 * loads it and validates env files against it. Consumed by:
 *   - scripts/check-env.mjs            (deploy preflight; never prints values)
 *   - scripts/__tests__/env-docs.test.ts (fails CI if .env.example or
 *     docs/ENVIRONMENTS.md omit a variable, or if code starts reading one
 *     that is not listed here)
 *
 * Examples here are shape-only placeholders — never real secrets.
 */
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';

export const TARGETS = {
  prod: { name: 'prod-links', port: 7102 },
  dev: { name: 'dev-links', port: 3102 },
};

export const BASE_PATH = '/links';

/**
 * status:
 *   required         must be set in the env file for a deployed instance
 *   first-boot       required only on the very first boot, then removed
 *   optional         read, has a safe default when unset
 *   forbidden        must NOT be set (the app refuses to boot if it is)
 *   runtime-set      injected by Next.js / pm2 — not set in the env file
 *   dependency       read by an @ima-jin/* dependency on a code path links
 *                    does not exercise; leave unset
 *   template-unused  present in the app template's .env.example but not read
 *                    by any code in this repo; safe to omit
 * phase: 'build' = baked into the build (set before `next build`),
 *        'runtime' = read at process start / request time,
 *        'script' = read only by an operator/CI script.
 *
 * The table itself lives in env-vars.json — pure data, one entry per variable
 * (name, status, phase, optional secret, summary, dev and prod examples). The
 * rows are uniform by design, so they are kept out of the code, where
 * duplication analysis would otherwise count them as copy-paste.
 */
/** @type {Array<{ name: string, status: string, phase: string, secret?: boolean, summary: string, dev: string, prod: string }>} */
export const ENV_VARS = JSON.parse(readFileSync(new URL('./env-vars.json', import.meta.url), 'utf8'));

export const ENV_VAR_NAMES = ENV_VARS.map((v) => v.name);

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
}

function checkKernelUrl(name, value, target, errors) {
  const url = parseUrl(value);
  if (url === null || !/^https?:$/.test(url.protocol)) {
    errors.push(`${name} is not a valid http(s) URL.`);
    return;
  }
  if (isLocalHost(url.hostname)) {
    errors.push(`${name} points at localhost — a deployed ${target} instance must use the real kernel host.`);
    return;
  }
  const isDevHost = url.hostname.startsWith('dev-');
  if (target === 'prod' && isDevHost) {
    errors.push(`${name} points at a dev host (${url.hostname}) in a prod env file.`);
  }
  if (target === 'dev' && !isDevHost) {
    errors.push(`${name} points at a non-dev host (${url.hostname}) in a dev env file — dev must never talk to the prod kernel.`);
  }
}

/**
 * Pure validation of a parsed env file for a deploy target. Returns
 * `{ errors, warnings }`; messages name variables, never values.
 * @param {Record<string, string | undefined>} env
 * @param {'prod' | 'dev'} target
 */
export function validateEnv(env, target) {
  if (!(target in TARGETS)) {
    throw new Error(`Unknown target ${JSON.stringify(target)} — expected prod or dev.`);
  }
  const errors = [];
  const warnings = [];
  const get = (name) => (env[name] ?? '').trim();

  for (const variable of ENV_VARS) {
    if (variable.status === 'required' && get(variable.name) === '') {
      errors.push(`${variable.name} is required but not set.`);
    }
    if (variable.status === 'forbidden' && get(variable.name) !== '') {
      errors.push(`${variable.name} must not be set (${variable.summary})`);
    }
  }

  const databaseUrl = get('DATABASE_URL');
  if (databaseUrl !== '' && !/^postgres(ql)?:$/.test(parseUrl(databaseUrl)?.protocol ?? '')) {
    errors.push('DATABASE_URL must be a postgres:// or postgresql:// URL.');
  }

  const schema = get('APP_DB_SCHEMA');
  if (schema !== '' && schema !== 'links') {
    errors.push('APP_DB_SCHEMA must be `links` — the existing schema this app owns; renaming it orphans migration state.');
  }

  const basePath = get('NEXT_PUBLIC_BASE_PATH');
  if (basePath !== '' && basePath !== BASE_PATH) {
    errors.push(`NEXT_PUBLIC_BASE_PATH must be ${BASE_PATH}.`);
  }

  const authUrl = get('AUTH_SERVICE_URL');
  if (authUrl !== '') {
    checkKernelUrl('AUTH_SERVICE_URL', authUrl, target, errors);
    if (!authUrl.endsWith('/auth') && !authUrl.endsWith('/auth/')) {
      errors.push('AUTH_SERVICE_URL must include the /auth prefix.');
    }
  }
  for (const name of ['IMAJIN_KERNEL_URL', 'NEXT_PUBLIC_KERNEL_URL']) {
    if (get(name) !== '') checkKernelUrl(name, get(name), target, errors);
  }
  if (get('IMAJIN_KERNEL_URL') !== '' && get('NEXT_PUBLIC_KERNEL_URL') !== '') {
    if (parseUrl(get('IMAJIN_KERNEL_URL'))?.host !== parseUrl(get('NEXT_PUBLIC_KERNEL_URL'))?.host) {
      errors.push('IMAJIN_KERNEL_URL and NEXT_PUBLIC_KERNEL_URL must point at the same kernel host.');
    }
  }

  const appUrl = get('NEXT_PUBLIC_APP_URL');
  if (appUrl !== '') {
    checkKernelUrl('NEXT_PUBLIC_APP_URL', appUrl, target, errors);
  }

  if (get('IMAJIN_APP_DID') !== '' && !get('IMAJIN_APP_DID').startsWith('did:imajin:')) {
    errors.push('IMAJIN_APP_DID must start with did:imajin:.');
  }
  if (get('IMAJIN_APP_DID').includes('REPLACE_ME')) {
    errors.push('IMAJIN_APP_DID is still the REPLACE_ME placeholder — mint the app identity first (docs/REGISTRATION.md).');
  }

  const imajinEnv = get('IMAJIN_ENV');
  if (target === 'dev' && imajinEnv !== 'dev') {
    errors.push('IMAJIN_ENV must be `dev` on the dev instance (selects the imajin_session_dev cookie).');
  }
  if (target === 'prod' && imajinEnv === 'dev') {
    errors.push('IMAJIN_ENV=dev must not be set on prod (it would read the dev session cookie).');
  }

  const port = get('PORT');
  if (port !== '' && port !== String(TARGETS[target].port)) {
    warnings.push(`PORT is set in the env file but ${TARGETS[target].name} runs on ${TARGETS[target].port}; the pm2 entry's value wins.`);
  }
  const vaultDid = get('LINKS_VAULT_BOOTSTRAP_DID');
  const vaultKey = get('LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY');
  if (vaultDid === '' || vaultKey === '') {
    warnings.push(
      'LINKS_VAULT_BOOTSTRAP_DID and LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY are not both set — the vault-sourced ATTESTATION_INTERNAL_API_KEY cannot be fetched at boot, so kernel-internal calls will fail closed (docs/DEPLOY.md).',
    );
  }
  if (get('ATTESTATION_INTERNAL_API_KEY') !== '') {
    warnings.push('ATTESTATION_INTERNAL_API_KEY is set but ignored — the key is vault-sourced; remove it (docs/ENVIRONMENTS.md).');
  }
  if (get('IMAJIN_APP_CLAIM_CODE') !== '') {
    warnings.push('IMAJIN_APP_CLAIM_CODE is set — it is needed on the first boot only; remove it once the app has booted once.');
  }
  for (const name of ['ENABLE_APP_LOG', 'LOG_DB_TRANSPORT', 'ENABLE_REQUEST_LOG']) {
    if (get(name) === 'true') {
      warnings.push(`${name}=true — this app is stdout-logging only (AGENTS.md); leave it unset.`);
    }
  }

  return { errors, warnings };
}

/**
 * Reads and parses an env file WITHOUT touching process.env.
 * @param {string} path
 */
export function readEnvFile(path) {
  return parseEnv(readFileSync(path, 'utf8'));
}
