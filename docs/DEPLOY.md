# Deploying links (prod + dev)

links is deployed from **this repo**, as its own pm2 process behind the kernel host's Caddy. Nothing in
`ima-jin/imajin-ai` builds, migrates, or restarts it any more (imajin-ai#1986 phase 2).

| | dev | prod |
|---|---|---|
| pm2 process | `dev-links` | `prod-links` |
| Checkout on the server | `~/dev/links` | `~/prod/links` |
| Local port | `3102` | `7102` |
| Public URL | `https://dev-jin.imajin.ai/links` | `https://jin.imajin.ai/links` |
| Health | `http://127.0.0.1:3102/links/api/health` | `http://127.0.0.1:7102/links/api/health` |

## The one command

From the target's checkout on the server:

```bash
scripts/deploy.sh dev     # or: scripts/deploy.sh prod
scripts/deploy.sh prod --ref v0.2.0   # a specific tag / sha (this is also the rollback)
scripts/deploy.sh prod --dry-run      # print the plan, execute nothing
```

It is fail-fast: any failure before step 7 stops the deploy and the running process keeps serving the previous
build. The env file is the single source of truth: contract variables exported in the calling shell are ignored
(and listed by name), because `node --env-file` and `pm2 --update-env` would otherwise let a stray `DATABASE_URL`
win. Note that step 2 swaps in the new ref's `deploy.sh`, so a change to the script itself takes effect from the
*next* run.

1. **preflight** — `git`, `node` (>= `.nvmrc`), `pnpm`, `pm2`, `curl` on `PATH`; no local changes to tracked files;
   `.env.local` exists; no stale `pm2` entry of the same name pointing at a different path (see
   [cutover](#one-time-cutover-checklist)).
2. **checkout** — `git fetch --tags --prune`, then `git checkout --detach` the ref (default `origin/main`). Never
   `git pull`.
3. **env check** — `scripts/check-env.mjs <target>` validates `.env.local` for the target (names only, never values).
   See [ENVIRONMENTS.md](./ENVIRONMENTS.md).
4. **install** — `pnpm install --frozen-lockfile`.
5. **build** — `next build` with `.env.local` loaded, so `NEXT_PUBLIC_*` values are baked in.
6. **baseline + migrate** — `scripts/migrate-baseline.mjs` (idempotent; refuses on mismatch), then
   `drizzle-kit migrate` (forward-only). See [Migration baseline](#migration-baseline).
7. **restart** — `pm2 startOrReload ecosystem.config.cjs --only <prod|dev>-links --update-env`, then `pm2 save`.
8. **health** — polls `/links/api/health` for up to 60 s and requires `"status":"ok"` (includes a DB round-trip).
   A non-healthy result exits non-zero.

## First deploy of an environment (fresh checkout)

There is no checkout of this repo on the server yet. After the operator steps below are done, it is still one
command per environment:

```bash
git clone https://github.com/ima-jin/links.git ~/prod/links && cd ~/prod/links
cp .env.prod.example .env.local && chmod 600 .env.local   # then fill in the placeholders
scripts/deploy.sh prod
```

Use `~/dev/links` and `.env.dev.example` / `scripts/deploy.sh dev` for dev. Deploy **dev first** and confirm
`https://dev-jin.imajin.ai/links/api/health` before touching prod.

### Operator steps this repo cannot do

- **Mint the app identity** (separate card; [REGISTRATION.md](./REGISTRATION.md)): set `IMAJIN_APP_DID` and, for the
  first boot only, `IMAJIN_APP_CLAIM_CODE` in `.env.local`. `check-env.mjs` fails while `IMAJIN_APP_DID` is still the
  `REPLACE_ME` placeholder. The claim code is single-use: the first successful boot writes the keystore
  (`IMAJIN_APP_KEYSTORE`, mode 0600); **delete the claim code from `.env.local` afterwards**. Do not lose the
  keystore — a lost keystore needs a `reissueClaim` rebind.
- **Create the databases/roles** and put the connection strings in each `.env.local`. Prod/dev already contain the
  `links` schema; the baseline adopts it in place.
- **Caddy** — the route already exists; verify it against the [snippet below](#caddy).

### One-time cutover checklist

1. Back up the `links` schema (`pg_dump --schema=links …`) before the first prod run.
2. `pm2 delete prod-links && pm2 save` (and `dev-links`) if an old entry still points at the pruned
   `~/prod/imajin-ai/apps/links` path. `deploy.sh` refuses to run while a same-named entry points elsewhere,
   because pm2 would "reload" it with the old script and cwd. Removing old entries is deliberately never
   automatic.
3. Optionally dry-run the baseline against prod first: `node --env-file=.env.local scripts/migrate-baseline.mjs --dry-run`.
4. `scripts/deploy.sh dev`, verify, then `scripts/deploy.sh prod`.

## Migration baseline

The existing `links` schema was created by the monorepo's shared root migrations, long before this repo had its
own drizzle history. This repo's `migrations/0000_*.sql` starts with `CREATE SCHEMA "links"`, so a bare
`pnpm db:migrate` against prod/dev would fail immediately. `scripts/migrate-baseline.mjs` bridges that:

```bash
node --env-file=.env.local scripts/migrate-baseline.mjs            # baseline (what deploy.sh runs)
node --env-file=.env.local scripts/migrate-baseline.mjs --dry-run  # validate only, write nothing
```

- **Idempotent.** If migration 0000 is already recorded in `"drizzle"."__drizzle_migrations"` it does nothing and
  exits 0, so `deploy.sh` runs it every time.
- **Refuses on mismatch.** It introspects the live `links` schema (tables, columns, types, nullability, defaults,
  primary/unique keys, foreign keys and their actions, required indexes) and compares it with what migration 0000
  produces. Any difference — missing/extra table or column, wrong type, missing FK or index, or unrecognised
  rows already in the tracking table — exits **1** with a list of the problems and changes nothing. The only
  tolerated differences are constraint *names* (the monorepo seed named the primary keys `link_pages_pkey` /
  `link_clicks_pkey`) and extra indexes. Reconcile the schema by hand; never force it.
- **Never drops, truncates, or alters.** The app schema is only ever read (`pg_catalog` SELECTs). The only writes
  are `CREATE SCHEMA/TABLE IF NOT EXISTS` for drizzle's own tracking table and one `INSERT` of the 0000 hash, in
  one transaction under an advisory lock. The test suite asserts this by auditing every statement issued.
- **Fresh databases** (no `links` schema) are left alone: it reports "nothing to baseline" and exit 0, and
  `drizzle-kit migrate` then creates everything.
- Exit codes: `0` ok · `1` refused (mismatch) · `2` usage/config/connection error.

After the baseline, `drizzle-kit migrate` applies only migrations newer than 0000. Migrations are forward-only;
there is no down-migration. New migrations must be additive/guarded (`IF NOT EXISTS`) — see
[MIGRATIONS.md](./MIGRATIONS.md).

## pm2

`ecosystem.config.cjs` defines `prod-links` (7102) and `dev-links` (3102). Each entry execs
`node_modules/next/dist/bin/next start -p <port>` directly (never `npm start` — imajin-ai#2447: pm2 would track the
npm wrapper and orphan `next-server` on restart), loads `.env.local` with `node --env-file` (Node exits if the
file is missing, so a links with no env crashes loudly instead of booting without its identity), uses this
checkout as `cwd`, and logs to `~/.pm2/logs/<name>-out.log` / `<name>-error.log`. A checkout only ever starts its
own entry (`--only`).

```bash
pm2 logs prod-links --lines 100     # stdout (the app logs to stdout only)
pm2 describe prod-links
```

## Caddy

The route is unchanged from the monorepo era. The app is mounted under the `/links` basePath and Caddy must
forward the prefix **intact** — use `handle`, not `handle_path` (which strips it):

```caddy
# prod — inside the existing jin.imajin.ai site block
jin.imajin.ai {
    @links path /links /links/*
    handle @links {
        reverse_proxy localhost:7102
    }
    # ...the rest of the site (kernel and other apps) unchanged
}

# dev — inside the existing dev-jin.imajin.ai site block
dev-jin.imajin.ai {
    @links path /links /links/*
    handle @links {
        reverse_proxy localhost:3102
    }
}
```

Verify: `curl -fsS https://jin.imajin.ai/links/api/health` → `{"status":"ok","service":"links",…}`.

## Rollback

Redeploy the previous tag or sha: `scripts/deploy.sh prod --ref <previous-tag>`. Migrations are forward-only, so a
rollback is only safe while migrations stay additive (the same stance as imajin-ai's `docs/ops/ROLLBACK.md`).

## Troubleshooting

- **`baseline` exits 1** — the message lists exactly what differs. Do not edit the script to force it; fix the schema
  (or tell the app owner the schema drifted), then re-run.
- **`env check` fails** — each line names a variable; see [ENVIRONMENTS.md](./ENVIRONMENTS.md).
- **Health never goes green on a first boot** — `pm2 logs <name>`: a missing/used claim code or wrong
  `IMAJIN_APP_DID` fails at `instrumentation.ts`. The dev and prod instances must each have their own DID, claim
  code and keystore.
- **Login loops on dev only** — `IMAJIN_ENV=dev` is missing (wrong session cookie name).
- **`/dashboard` redirects to `kernel.imajin.ai`** — `NEXT_PUBLIC_KERNEL_URL` was not set at build time; set it and redeploy.
