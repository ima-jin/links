# links — sovereign link-in-bio pages on Imajin

> Forked from [`ima-jin/imajin-app-template`](https://github.com/ima-jin/imajin-app-template). **Read
> [`AGENTS.md`](./AGENTS.md) first** — it defines the boundary this app must not cross.

**Platform:** [Imajin](https://imajin.ai) (sovereign-tech kernel) · Extracted per
[ima-jin/imajin-ai#1986](https://github.com/ima-jin/imajin-ai/issues/1986) (phase 1 of #1981) — see
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

Curated link-in-bio pages with privacy-preserving click analytics: no invasive tracking, custom themes, and
integration with the rest of the Imajin network. This repository **is the app** — a real, arms-length third-party
application that composes the Imajin platform **only through its public app surface**. It holds no `workspace:*`
deps, no monorepo internals, and its own Postgres schema (never a kernel schema or another app's schema).

## What this replaces

The original `apps/links` in `ima-jin/imajin-ai` (removed from the monorepo in a later phase, once this app boots on
dev). Table names, route paths, and behavior are unchanged; only the auth mechanism and a few kernel-internal
dependencies changed — see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)'s "Known simplifications" section for
the honest list.

## Getting started

1. **Register this app with the kernel** — see [`docs/REGISTRATION.md`](./docs/REGISTRATION.md). You'll get back
   this app's `appDid` and registry id.
2. **Set env**: `cp .env.example .env.local`, then fill in `IMAJIN_APP_DID`, `NEXT_PUBLIC_IMAJIN_APP_ID`,
   `DATABASE_URL`, `APP_DB_SCHEMA` (`links`), `AUTH_SERVICE_URL`, `IMAJIN_KERNEL_URL`, and (first boot only)
   `IMAJIN_APP_CLAIM_CODE`. This app refuses to start without a signing key it can fetch via `loadAppSigningKey()`
   (see `instrumentation.ts`) — never a raw `IMAJIN_APP_PRIVATE_KEY` in the env file.
3. **Migrate this app's own database** (its own Postgres schema only — see
   [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md)):
   ```bash
   pnpm install
   pnpm db:migrate
   ```
4. **Run it**:
   ```bash
   pnpm dev   # http://localhost:3102
   ```
   The app is served under the `/links` basePath (Caddy forwards `/links/*` with the prefix intact) — the next
   free dev port after `ima-jin/dykil`'s `3101`, matching the port `@imajin/config`'s own service manifest already
   reserves for `links` in the monorepo. `/links/api/health` and `/links/api/spec` respond immediately.

## Deploying

Prod and dev are deployed with one command, `scripts/deploy.sh <prod|dev>` — see [`docs/DEPLOY.md`](./docs/DEPLOY.md)
(runbook, Caddy route, pm2, migration baseline) and [`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md) (every env var).

## The routes

| Route | What | Auth |
|---|---|---|
| `GET /api/health` | health check (includes a DB round-trip) | none |
| `GET /api/spec` | this app's own OpenAPI document | none |
| `GET /:handle` | public link-in-bio page | none (respects per-link `authenticated` visibility) |
| `POST /api/pages` | create a links page (one per DID) | owner |
| `GET /api/pages/mine` | the caller's own page + links | owner |
| `POST /api/pages/auto-create` | auto-create a page from public profile data | owner |
| `GET/PUT/DELETE /api/pages/:handle` | read (public if published) / update / delete | owner (mutations) |
| `POST /api/pages/:handle/links` | add links to a page | owner |
| `GET /api/pages/:handle/stats` | click stats, last 30 days | owner |
| `PUT/DELETE /api/links/:id` | update / delete a single link | owner |
| `POST /api/links/:id/click` | record a click (privacy-preserving) | none |

## Auth

Every route authenticates through one interface — `authenticate()` in `src/lib/auth/authenticate.ts` — never
`@ima-jin/auth`'s primitives directly, mirroring `ima-jin/dykil`'s already-settled adoption of the #1069 Phase 1
scoped app-token (coffee's #1974 reference implementation). See
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Consuming `@ima-jin/*`

`@ima-jin/auth`, `@ima-jin/auth-client`, `@ima-jin/config`, and `@ima-jin/logger` are published to **npmjs.org**
under the `@ima-jin` scope — anonymous `pnpm install`, no `.npmrc` scoping and no auth token needed.

## Layout

```
AGENTS.md          <- boundary + scope for coding agents (read first)
README.md          <- this file
docs/
  ARCHITECTURE.md  <- three-tier model, auth pattern, known simplifications
  REGISTRATION.md  <- how to register this app with the kernel
  MIGRATIONS.md    <- this app's schema-ownership rule
app/               <- Next.js App Router: pages + the 10 API routes
src/
  lib/
    auth/          <- authenticate() (inbound) + signing-identity (loadAppSigningKey boot path)
    kernel/        <- kernel HTTP clients (profile lookup for auto-create)
    utils.ts       <- domain validation + theme presets
    http.ts        <- response + CORS helpers
    env.ts         <- central env accessors
  db/              <- this app's own drizzle schema (pages / links / clicks), never a kernel schema
  components/      <- Header, Toast (self-contained — no @imajin/ui dependency, see DECISION note in the PR)
migrations/        <- generated by `pnpm db:generate`, applied by `pnpm db:migrate`
api-spec/          <- this app's own OpenAPI document, served at /api/spec
instrumentation.ts <- boot-env guards + loadAppSigningKey() bootstrap
```
