/**
 * Single source of truth for every environment variable this app (or a
 * dependency it loads, or one of its scripts) reads — refs
 * ima-jin/imajin-ai#2490. Consumed by:
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
 */
export const ENV_VARS = [
  {
    name: 'DATABASE_URL',
    status: 'required',
    phase: 'runtime',
    secret: true,
    summary: "Postgres connection string for this app's own database (also read by drizzle-kit and scripts/migrate-baseline.mjs).",
    dev: 'postgres://<role>:<password>@localhost:5432/<dev_db>',
    prod: 'postgres://<role>:<password>@localhost:5432/<prod_db>',
  },
  {
    name: 'APP_DB_SCHEMA',
    status: 'required',
    phase: 'runtime',
    summary: 'The one Postgres schema this app owns. Fixed to `links` — the existing prod/dev schema; never change it.',
    dev: 'links',
    prod: 'links',
  },
  {
    name: 'AUTH_SERVICE_URL',
    status: 'required',
    phase: 'runtime',
    summary: "Kernel auth service base URL, including the /auth prefix. Read by @ima-jin/auth for session and app-token verification.",
    dev: 'https://dev-jin.imajin.ai/auth',
    prod: 'https://jin.imajin.ai/auth',
  },
  {
    name: 'IMAJIN_KERNEL_URL',
    status: 'required',
    phase: 'runtime',
    summary: 'Kernel base URL (no path). Used to fetch this app\'s signing key at boot and for the best-effort profile lookup.',
    dev: 'https://dev-jin.imajin.ai',
    prod: 'https://jin.imajin.ai',
  },
  {
    name: 'NEXT_PUBLIC_KERNEL_URL',
    status: 'required',
    phase: 'build',
    summary:
      'Absolute kernel URL baked into next.config.js\'s /dashboard redirect at BUILD time via @ima-jin/config. Without it the redirect resolves to a non-existent host (kernel.imajin.ai). Rebuild after changing.',
    dev: 'https://dev-jin.imajin.ai',
    prod: 'https://jin.imajin.ai',
  },
  {
    name: 'NEXT_PUBLIC_BASE_PATH',
    status: 'required',
    phase: 'build',
    summary: 'Reverse-proxy path prefix the app is mounted under. Must be `/links`. Baked at build time; rebuild after changing.',
    dev: '/links',
    prod: '/links',
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    status: 'required',
    phase: 'runtime',
    summary:
      "This app's public URL. Its HOST is the `aud` used to verify scoped app tokens — it must match a host in this app's registered tokenAudiences (operator-confirmed at registration).",
    dev: 'https://dev-jin.imajin.ai/links',
    prod: 'https://jin.imajin.ai/links',
  },
  {
    name: 'IMAJIN_APP_DID',
    status: 'required',
    phase: 'runtime',
    summary: "This app's own did:imajin:… from registration (docs/REGISTRATION.md). instrumentation.ts refuses to boot without it. Not a secret.",
    dev: 'did:imajin:<dev app DID>',
    prod: 'did:imajin:<prod app DID>',
  },
  {
    name: 'IMAJIN_ENV',
    status: 'optional',
    phase: 'runtime',
    summary:
      'Selects the kernel session cookie name in @ima-jin/config: `dev` → imajin_session_dev, anything else → imajin_session. MUST be `dev` on the dev instance (a production build is NODE_ENV=production, which does not imply dev); leave unset on prod.',
    dev: 'dev',
    prod: '(unset)',
  },
  {
    name: 'IMAJIN_APP_CLAIM_CODE',
    status: 'first-boot',
    phase: 'runtime',
    secret: true,
    summary:
      "One-time code from the kernel operator's /jin approval card. Needed only on the very first boot (no keystore yet) or a lost-keystore rebind; delete it after the first successful boot.",
    dev: '(only on first boot)',
    prod: '(only on first boot)',
  },
  {
    name: 'IMAJIN_APP_KEYSTORE',
    status: 'optional',
    phase: 'runtime',
    summary:
      "Path of this app's 0600 bootstrap keystore (never the vault key itself). Default ./.imajin/keystore.json relative to the process cwd. Must be writable, persist across deploys, and be separate for dev and prod.",
    dev: '/home/jin/.imajin/links.dev.keystore.json',
    prod: '/home/jin/.imajin/links.prod.keystore.json',
  },
  {
    name: 'IMAJIN_APP_PRIVATE_KEY',
    status: 'forbidden',
    phase: 'runtime',
    secret: true,
    summary: 'Removed. The app throws at boot if this is set — the signing key comes from loadAppSigningKey(), never from env.',
    dev: '(never set)',
    prod: '(never set)',
  },
  {
    name: 'PORT',
    status: 'runtime-set',
    phase: 'runtime',
    summary: 'Listen port. Set by the pm2 ecosystem entry (prod 7102, dev 3102); only used directly by `pnpm dev`.',
    dev: '3102',
    prod: '7102',
  },
  {
    name: 'NODE_ENV',
    status: 'runtime-set',
    phase: 'runtime',
    summary: 'Set to `production` by the pm2 entry and by `next build`/`next start`. Do not set it in the env file.',
    dev: 'production',
    prod: 'production',
  },
  {
    name: 'NEXT_RUNTIME',
    status: 'runtime-set',
    phase: 'runtime',
    summary: 'Injected by Next.js; instrumentation.ts only bootstraps the signing key when it is `nodejs`. Never set by hand.',
    dev: '(set by Next.js)',
    prod: '(set by Next.js)',
  },
  {
    name: 'NEXT_PUBLIC_SERVICE_PREFIX',
    status: 'optional',
    phase: 'build',
    summary: 'Read by @ima-jin/config to derive service URLs when NEXT_PUBLIC_KERNEL_URL is unset. Prefer NEXT_PUBLIC_KERNEL_URL; leave unset.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'NEXT_PUBLIC_DOMAIN',
    status: 'optional',
    phase: 'build',
    summary: 'Companion to NEXT_PUBLIC_SERVICE_PREFIX (default imajin.ai). Leave unset; use NEXT_PUBLIC_KERNEL_URL.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'LOG_LEVEL',
    status: 'optional',
    phase: 'runtime',
    summary: 'pino log level for @ima-jin/logger (default info). Output is stdout only; pm2 captures it.',
    dev: 'debug',
    prod: 'info',
  },
  {
    name: 'ENABLE_REQUEST_LOG',
    status: 'optional',
    phase: 'runtime',
    summary: 'Logger request-log switch. Leave unset: this app wires no log sink (AGENTS.md — stdout only).',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'ENABLE_APP_LOG',
    status: 'optional',
    phase: 'runtime',
    summary: 'Logger persisted-log switch. Leave unset: this app never persists logs to a database.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'LOG_DB_TRANSPORT',
    status: 'optional',
    phase: 'runtime',
    summary: 'Logger DB-transport switch. Leave unset: logging must never touch a data store (AGENTS.md).',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'APP_LOG_LEVEL',
    status: 'optional',
    phase: 'runtime',
    summary: 'Minimum level the logger would persist (default warn). Inert while persistence is off.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'ATTESTATION_INTERNAL_API_KEY',
    status: 'dependency',
    phase: 'runtime',
    secret: true,
    summary: '@ima-jin/auth act-as / attestation calls. links exercises neither; leave unset. Never hand-mint it.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'AUTH_INTERNAL_API_KEY',
    status: 'dependency',
    phase: 'runtime',
    secret: true,
    summary: 'Deprecated @ima-jin/auth internal key (agent delegation). Not used by links; leave unset.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'PROFILE_SERVICE_URL',
    status: 'dependency',
    phase: 'runtime',
    summary: '@ima-jin/auth credential resolution. Not used by links (profile lookup goes through IMAJIN_KERNEL_URL); leave unset.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'PROFILE_INTERNAL_API_KEY',
    status: 'dependency',
    phase: 'runtime',
    secret: true,
    summary: '@ima-jin/auth credential resolution key. Not used by links; leave unset.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'NODE_DID',
    status: 'dependency',
    phase: 'runtime',
    summary: '@ima-jin/auth node-act-as check (kernel node DID). Not used by links; leave unset.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'APP_URL',
    status: 'dependency',
    phase: 'runtime',
    summary: '@ima-jin/auth fallback origin for redirects. links does not rely on it; leave unset.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'NEXT_PUBLIC_BASE_URL',
    status: 'dependency',
    phase: 'runtime',
    summary: '@ima-jin/auth fallback origin for redirects (after APP_URL). links does not rely on it; leave unset.',
    dev: '(unset)',
    prod: '(unset)',
  },
  {
    name: 'NEXT_PUBLIC_IMAJIN_AUTH_URL',
    status: 'template-unused',
    phase: 'build',
    summary: 'Listed in the app template; no code in this repo reads it. Safe to omit.',
    dev: 'https://dev-jin.imajin.ai',
    prod: 'https://jin.imajin.ai',
  },
  {
    name: 'NEXT_PUBLIC_IMAJIN_APP_ID',
    status: 'template-unused',
    phase: 'build',
    summary: 'Listed in the app template (registry `app_…` id); no code in this repo reads it. Safe to omit.',
    dev: '(optional)',
    prod: '(optional)',
  },
  {
    name: 'SESSION_COOKIE_SCOPE',
    status: 'template-unused',
    phase: 'runtime',
    summary: 'Listed in the app template; no code in this repo reads it. Safe to omit.',
    dev: 'host',
    prod: 'host',
  },
  {
    name: 'VERIFY_BOOT_PORT',
    status: 'optional',
    phase: 'script',
    summary: 'CI only: port scripts/verify-migration-boot.mjs starts the app on (default 4102). Not used in deployment.',
    dev: '(unset)',
    prod: '(unset)',
  },
];

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
