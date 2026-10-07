# Environments — links

Every environment variable the links app reads — directly, through its `@ima-jin/*` dependencies, or in its
scripts — with what it does, when it is read, and its dev and prod values. This file, `.env.example`, and
`scripts/lib/env-manifest.mjs` are kept in lock-step by `scripts/__tests__/env-docs.test.ts`: CI fails if code
starts reading a variable that is not documented here.

No secret values live in this repo. Examples are shape-only placeholders; real values live in the untracked
`.env.local` on each host.

## The three env files

| File | Used for | Lands at |
|---|---|---|
| `.env.example` | local development (`pnpm dev`) | `.env.local` in your working copy |
| `.env.dev.example` | the dev deployment (`dev-links`, port 3102, `https://dev-jin.imajin.ai/links`) | `~/dev/links/.env.local` |
| `.env.prod.example` | the prod deployment (`prod-links`, port 7102, `https://jin.imajin.ai/links`) | `~/prod/links/.env.local` |

On a server: `cp .env.<env>.example .env.local && chmod 600 .env.local`, fill the placeholders, then
`node scripts/check-env.mjs <prod|dev>`. `scripts/deploy.sh` runs that check for you on every deploy, and pm2 loads
the same file with `node --env-file` (see `ecosystem.config.cjs`).

## Build-time vs runtime

`next build` bakes every `NEXT_PUBLIC_*` value into the build (including `next.config.js`'s `basePath` and the
`/dashboard` redirect). **Changing one means rebuilding** — `scripts/deploy.sh` loads the env file for the build, so
a normal deploy handles it. Variables marked *runtime* are read when the process starts or per request; a
`pm2 restart --update-env` is enough.

## Dev vs prod at a glance

- **Kernel host.** Dev talks only to `https://dev-jin.imajin.ai`; prod only to `https://jin.imajin.ai`.
  `check-env.mjs` rejects a dev file pointing at a non-`dev-` host and a prod file pointing at a `dev-` host.
- **`IMAJIN_ENV`.** `dev` on dev (selects the `imajin_session_dev` cookie), **unset** on prod. A production build is
  `NODE_ENV=production` on both, so this is the only thing that tells dev from prod.
- **Database.** Separate Postgres database per environment; the schema name is `links` in both.
- **Keystore.** Separate `IMAJIN_APP_KEYSTORE` file per environment; each environment has its own app DID.
- **Port.** dev 3102, prod 7102 (from `ecosystem.config.cjs`, not the env file).

## Required on every deployed instance

Missing any of these and `scripts/check-env.mjs` fails the deploy before anything is built.

| Variable | When | Dev | Prod | What it does |
|---|---|---|---|---|
| `DATABASE_URL` **(secret)** | runtime | `postgres://<role>:<password>@localhost:5432/<dev_db>` | `postgres://<role>:<password>@localhost:5432/<prod_db>` | Postgres connection string for this app's own database (also read by drizzle-kit and scripts/migrate-baseline.mjs). |
| `APP_DB_SCHEMA` | runtime | `links` | `links` | The one Postgres schema this app owns. Fixed to `links` — the existing prod/dev schema; never change it. |
| `AUTH_SERVICE_URL` | runtime | `https://dev-jin.imajin.ai/auth` | `https://jin.imajin.ai/auth` | Kernel auth service base URL, including the /auth prefix. Read by @ima-jin/auth for session and app-token verification. |
| `IMAJIN_KERNEL_URL` | runtime | `https://dev-jin.imajin.ai` | `https://jin.imajin.ai` | Kernel base URL (no path). Used to fetch this app's signing key at boot and for the best-effort profile lookup. |
| `NEXT_PUBLIC_KERNEL_URL` | build | `https://dev-jin.imajin.ai` | `https://jin.imajin.ai` | Absolute kernel URL baked into next.config.js's /dashboard redirect at BUILD time via @ima-jin/config. Without it the redirect resolves to a non-existent host (kernel.imajin.ai). Rebuild after changing. |
| `NEXT_PUBLIC_BASE_PATH` | build | `/links` | `/links` | Reverse-proxy path prefix the app is mounted under. Must be `/links`. Baked at build time; rebuild after changing. |
| `NEXT_PUBLIC_APP_URL` | build | `https://dev-jin.imajin.ai/links` | `https://jin.imajin.ai/links` | This app's public URL including the `/links` base path. Public pages are served at `${NEXT_PUBLIC_APP_URL}/{handle}` (shown and linked on the edit and dashboard pages; there is no fallback host, so unset/invalid fails). Baked into the client bundle at build time; rebuild after changing. Its HOST is the `aud` used to verify scoped app tokens — it must match a host in this app's registered tokenAudiences (operator-confirmed at registration). |
| `IMAJIN_APP_DID` | runtime | `did:imajin:<dev app DID>` | `did:imajin:<prod app DID>` | This app's own did:imajin:… from registration (docs/REGISTRATION.md). instrumentation.ts refuses to boot without it. Not a secret. |

## First boot only

Set once, then delete.

| Variable | When | Dev | Prod | What it does |
|---|---|---|---|---|
| `IMAJIN_APP_CLAIM_CODE` **(secret)** | runtime | optional | optional | Optional fallback (advanced/CI). The normal path is pasting the one-time code from the kernel operator's /jin approval card on `<app>/claim` (imajin-ai#2427) — no env var needed. If set, it is spent on first boot (no keystore yet) or a lost-keystore rebind; delete it afterwards. |

## Optional

Read by the app or its dependencies and safe to leave unset.

| Variable | When | Dev | Prod | What it does |
|---|---|---|---|---|
| `IMAJIN_ENV` | runtime | `dev` | (unset) | Selects the kernel session cookie name in @ima-jin/config: `dev` → imajin_session_dev, anything else → imajin_session. MUST be `dev` on the dev instance (a production build is NODE_ENV=production, which does not imply dev); leave unset on prod. |
| `IMAJIN_APP_KEYSTORE` | runtime | `/home/jin/.imajin/links.dev.keystore.json` | `/home/jin/.imajin/links.prod.keystore.json` | Path of this app's 0600 bootstrap keystore (never the vault key itself). Default ./.imajin/keystore.json relative to the process cwd. Must be writable, persist across deploys, and be separate for dev and prod. |
| `LINKS_VAULT_BOOTSTRAP_DID` | runtime | `did:imajin:<dev vault bootstrap DID>` | `did:imajin:<prod vault bootstrap DID>` | DID of this app's vault bootstrap identity, issued by the kernel operator. Read by @ima-jin/auth's bootstrapInternalApiKey('links') at boot (instrumentation.ts) to fetch the vault-sourced ATTESTATION_INTERNAL_API_KEY; the DID must hold the attestation-key grant (docs/DEPLOY.md). Set it together with LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY; if either is missing, boot logs an error and the key stays unset (kernel-internal calls fail closed). Not a secret. |
| `LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY` **(secret)** | runtime | `<dev vault bootstrap private key>` | `<prod vault bootstrap private key>` | Private key of this app's vault bootstrap identity (pair of LINKS_VAULT_BOOTSTRAP_DID), issued by the kernel operator. Authenticates the boot-time vault fetch of ATTESTATION_INTERNAL_API_KEY only; never the app's signing key. Keep .env.local mode 0600; never commit it. |
| `NEXT_PUBLIC_SERVICE_PREFIX` | build | (unset) | (unset) | Read by @ima-jin/config to derive service URLs when NEXT_PUBLIC_KERNEL_URL is unset. Prefer NEXT_PUBLIC_KERNEL_URL; leave unset. |
| `NEXT_PUBLIC_DOMAIN` | build | (unset) | (unset) | Companion to NEXT_PUBLIC_SERVICE_PREFIX (default imajin.ai). Leave unset; use NEXT_PUBLIC_KERNEL_URL. |
| `LOG_LEVEL` | runtime | `debug` | `info` | pino log level for @ima-jin/logger (default info). Output is stdout only; pm2 captures it. |
| `ENABLE_REQUEST_LOG` | runtime | (unset) | (unset) | Logger request-log switch. Leave unset: this app wires no log sink (AGENTS.md — stdout only). |
| `ENABLE_APP_LOG` | runtime | (unset) | (unset) | Logger persisted-log switch. Leave unset: this app never persists logs to a database. |
| `LOG_DB_TRANSPORT` | runtime | (unset) | (unset) | Logger DB-transport switch. Leave unset: logging must never touch a data store (AGENTS.md). |
| `APP_LOG_LEVEL` | runtime | (unset) | (unset) | Minimum level the logger would persist (default warn). Inert while persistence is off. |
| `VERIFY_BOOT_PORT` | script | (unset) | (unset) | CI only: port scripts/verify-migration-boot.mjs starts the app on (default 4102). Not used in deployment. |

## Forbidden

Setting any of these is an error.

| Variable | When | Dev | Prod | What it does |
|---|---|---|---|---|
| `IMAJIN_APP_PRIVATE_KEY` **(secret)** | runtime | (never set) | (never set) | Removed. The app throws at boot if this is set — the signing key comes from loadAppSigningKey(), never from env. |

## Set by the platform — not in the env file

Provided by pm2 (`ecosystem.config.cjs`) or Next.js.

| Variable | When | Dev | Prod | What it does |
|---|---|---|---|---|
| `PORT` | runtime | `3102` | `7102` | Listen port. Set by the pm2 ecosystem entry (prod 7102, dev 3102); only used directly by `pnpm dev`. |
| `NODE_ENV` | runtime | `production` | `production` | Set to `production` by the pm2 entry and by `next build`/`next start`. Do not set it in the env file. |
| `NEXT_RUNTIME` | runtime | (set by Next.js) | (set by Next.js) | Injected by Next.js; instrumentation.ts only bootstraps the signing key when it is `nodejs`. Never set by hand. |

## Read by dependencies on paths links does not use

Leave unset. Listed so the contract covers every variable the installed packages read.

| Variable | When | Dev | Prod | What it does |
|---|---|---|---|---|
| `ATTESTATION_INTERNAL_API_KEY` **(secret)** | runtime | (unset) | (unset) | Vault-sourced: @ima-jin/auth's kernel-internal calls use the key fetched at boot via LINKS_VAULT_BOOTSTRAP_* (instrumentation.ts) and ignore this variable. Leave unset; never hand-mint it. |
| `AUTH_INTERNAL_API_KEY` **(secret)** | runtime | (unset) | (unset) | Deprecated @ima-jin/auth internal key (agent delegation). Not used by links; leave unset. |
| `PROFILE_SERVICE_URL` | runtime | (unset) | (unset) | @ima-jin/auth credential resolution. Not used by links (profile lookup goes through IMAJIN_KERNEL_URL); leave unset. |
| `PROFILE_INTERNAL_API_KEY` **(secret)** | runtime | (unset) | (unset) | @ima-jin/auth credential resolution key. Not used by links; leave unset. |
| `NODE_DID` | runtime | (unset) | (unset) | @ima-jin/auth node-act-as check (kernel node DID). Not used by links; leave unset. |
| `APP_URL` | runtime | (unset) | (unset) | @ima-jin/auth fallback origin for redirects. links does not rely on it; leave unset. |
| `NEXT_PUBLIC_BASE_URL` | runtime | (unset) | (unset) | @ima-jin/auth fallback origin for redirects (after APP_URL). links does not rely on it; leave unset. |

## In the app template, read by nothing here

Safe to omit; kept in `.env.example` only for template parity.

| Variable | When | Dev | Prod | What it does |
|---|---|---|---|---|
| `NEXT_PUBLIC_IMAJIN_AUTH_URL` | build | `https://dev-jin.imajin.ai` | `https://jin.imajin.ai` | Listed in the app template; no code in this repo reads it. Safe to omit. |
| `NEXT_PUBLIC_IMAJIN_APP_ID` | build | (optional) | (optional) | Listed in the app template (registry `app_…` id); no code in this repo reads it. Safe to omit. |
| `SESSION_COOKIE_SCOPE` | runtime | `host` | `host` | Listed in the app template; no code in this repo reads it. Safe to omit. |

## Dev example

`.env.dev.example` (copy to `~/dev/links/.env.local`):

```dotenv
# links — DEV deployment env (dev-links, port 3102, https://dev-jin.imajin.ai/links)
# Copy to ~/dev/links/.env.local on the server (chmod 600) and fill the
# placeholders. Never commit the real file. Reference: docs/ENVIRONMENTS.md.
# Validate with: node scripts/check-env.mjs dev

# --- Build-time (baked in by `next build` — rebuild after changing) ---
NEXT_PUBLIC_BASE_PATH=/links
NEXT_PUBLIC_KERNEL_URL=https://dev-jin.imajin.ai

# --- Runtime ---
# PORT and NODE_ENV come from the pm2 entry (ecosystem.config.cjs).
NEXT_PUBLIC_APP_URL=https://dev-jin.imajin.ai/links
# MUST be `dev` here: selects the imajin_session_dev cookie.
IMAJIN_ENV=dev

DATABASE_URL=postgres://links:CHANGE_ME@localhost:5432/imajin_dev
APP_DB_SCHEMA=links

AUTH_SERVICE_URL=https://dev-jin.imajin.ai/auth
IMAJIN_KERNEL_URL=https://dev-jin.imajin.ai

# --- Identity (operator step: docs/REGISTRATION.md) ---
IMAJIN_APP_DID=did:imajin:REPLACE_ME
# First boot only — delete after the app has booted once.
# IMAJIN_APP_CLAIM_CODE=
# Persistent, per-environment keystore (must survive deploys):
IMAJIN_APP_KEYSTORE=/home/jin/.imajin/links.dev.keystore.json
# Vault bootstrap identity for the vault-sourced ATTESTATION_INTERNAL_API_KEY
# (issued by the kernel operator; separate per environment; docs/DEPLOY.md).
# Never set ATTESTATION_INTERNAL_API_KEY itself — it is fetched at boot.
LINKS_VAULT_BOOTSTRAP_DID=
LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY=

LOG_LEVEL=debug
```

## Prod example

`.env.prod.example` (copy to `~/prod/links/.env.local`):

```dotenv
# links — PROD deployment env (prod-links, port 7102, https://jin.imajin.ai/links)
# Copy to ~/prod/links/.env.local on the server (chmod 600) and fill the
# placeholders. Never commit the real file. Reference: docs/ENVIRONMENTS.md.
# Validate with: node scripts/check-env.mjs prod

# --- Build-time (baked in by `next build` — rebuild after changing) ---
NEXT_PUBLIC_BASE_PATH=/links
NEXT_PUBLIC_KERNEL_URL=https://jin.imajin.ai

# --- Runtime ---
# PORT and NODE_ENV come from the pm2 entry (ecosystem.config.cjs).
NEXT_PUBLIC_APP_URL=https://jin.imajin.ai/links
# IMAJIN_ENV is deliberately NOT set on prod (prod uses the imajin_session
# cookie). check-env.mjs rejects IMAJIN_ENV=dev here.

DATABASE_URL=postgres://links:CHANGE_ME@localhost:5432/imajin_prod
APP_DB_SCHEMA=links

AUTH_SERVICE_URL=https://jin.imajin.ai/auth
IMAJIN_KERNEL_URL=https://jin.imajin.ai

# --- Identity (operator step: docs/REGISTRATION.md) ---
IMAJIN_APP_DID=did:imajin:REPLACE_ME
# First boot only — delete after the app has booted once.
# IMAJIN_APP_CLAIM_CODE=
# Persistent, per-environment keystore (must survive deploys):
IMAJIN_APP_KEYSTORE=/home/jin/.imajin/links.prod.keystore.json
# Vault bootstrap identity for the vault-sourced ATTESTATION_INTERNAL_API_KEY
# (issued by the kernel operator; separate per environment; docs/DEPLOY.md).
# Never set ATTESTATION_INTERNAL_API_KEY itself — it is fetched at boot.
LINKS_VAULT_BOOTSTRAP_DID=
LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY=

LOG_LEVEL=info
```

## Secrets handling

- `DATABASE_URL` (carries the DB password), `LINKS_VAULT_BOOTSTRAP_PRIVATE_KEY` and `IMAJIN_APP_CLAIM_CODE` are the
  only secret-bearing variables a correct deployment sets. `ATTESTATION_INTERNAL_API_KEY` is never one of them: it is
  fetched from the vault at boot and held in process memory only.
- This app's signing key is **never** in an env file — `IMAJIN_APP_PRIVATE_KEY` makes the app refuse to boot. The key
  is fetched at boot by `loadAppSigningKey()`; only the 0600 bootstrap keystore (`IMAJIN_APP_KEYSTORE`) is
  persisted. Treat that file like the claim code: never commit, copy, or sync it.
- `check-env.mjs` and the deploy script print variable *names* only, never values.
