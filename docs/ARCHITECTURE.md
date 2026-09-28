# Architecture — links

> This app is a **lens** over the user's signed records, plus one small piece of state it genuinely owns: which
> links a DID has chosen to publish, and how many times each was clicked. See `AGENTS.md` §1–§3.

## Why links owns a schema (unlike dykil)

Per Jin's 2026-09-22 ruling, `links` is the **schema-owning reference app** for this extraction wave: not every
vertical collapses onto kernel primitives (dykil, #1985, does — zero tables). A curated list of links with a
position and a click counter is not itself a signed claim about the world; it is this app's own presentation state,
and it is cheap, uncontroversial data to own outright. `docs/MIGRATIONS.md` governs the rule: this app's own Postgres
schema (`APP_DB_SCHEMA=links`), nothing else's.

## The three-tier projection model

| Tier | What | Owns truth? |
|------|------|-------------|
| **User's own DID** | the owner of a links page — this app never mints or stores credentials for it | source of the identity |
| **Kernel** | authoritative *index/projection* of that DID (session validation, public profile data) | derived, not owned by this app |
| **This app's own schema (`links`)** | pages, links, and click counts — presentation state this app itself owns | ✅ owned outright, scoped to this app only |

## Auth: one interface, the settled #1069 pattern

Every route authenticates through exactly one function: `authenticate()` in `src/lib/auth/authenticate.ts`. No route
imports `@ima-jin/auth`'s primitives directly. `authenticate()` wraps `requireSessionOrAppToken` — a scoped
`Authorization: Bearer <app-token>` OR the shared kernel session cookie as a fallback — mirroring `ima-jin/dykil`'s
already-settled adoption of the same #1069 Phase 1 mechanism (coffee's #1974 reference implementation). This is not
re-litigated here; see `ima-jin/dykil`'s `FINDINGS.md` for the original DECISION record.

The cookie fallback works because this app is Caddy-routed **same-origin** under the kernel host (a `/links` path
prefix, exactly like `ima-jin/dykil`'s `/dykil`), not a separate subdomain — the browser's existing kernel session
cookie is naturally in scope.

The public `[handle]` page additionally calls `@ima-jin/auth`'s `getSession()` directly (a Server Component, not a
route handler) to decide whether to show links marked `visibility: authenticated` — the same mechanism, reached the
way a Next.js Server Component reaches it rather than a `Request`-based route handler.

## Request flow

```
Browser
  -> links (Authorization: Bearer <app-token>, or the shared kernel session cookie)
     authenticate() -- src/lib/auth/authenticate.ts (the ONE place this app's inbound auth lives)
  -> this app's own route logic (src/lib/utils.ts validation, ownership checks)
  -> this app's own Postgres schema (src/db — pages / links / clicks, drizzle-orm)
  -> (auto-create only) kernel profile lookup (src/lib/kernel/profile.ts) -- best-effort handle/name default
```

## Known simplifications (honest, not hidden)

- **Auto-create no longer gets a handle/display-name "for free."** The old in-monorepo `apps/links` read
  `identity.handle`/`identity.name` directly off `@imajin/auth`'s session `Identity`. The published
  `@ima-jin/auth`'s `SessionOrTokenAuth` deliberately carries only `{ did, scopes, via }` — no handle/name — so
  `POST /api/pages/auto-create` now makes a best-effort call to the kernel's public
  `GET /profile/api/profile/{did}` route instead (`src/lib/kernel/profile.ts`), falling back to a DID-derived handle
  if that lookup fails for any reason. Functionally equivalent in the common case; honestly weaker in the "profile
  lookup is down" edge case, where the old code had no equivalent failure mode to compare against.
- **`avatarAssetId` is stored, never resolved.** Both the original app and this port accept an opaque
  `avatarAssetId` string from the client and store it as-is; neither ever calls the kernel's media service to
  validate or resolve it to a URL. Not a regression — carried through unchanged.
- **The `/dashboard` -> hub-tab redirect moved from Edge middleware into `next.config.js`'s `redirects()`.**
  The original app implemented this as `middleware.ts` (Edge runtime). This app's `instrumentation.ts` needs
  `@ima-jin/auth-client`'s signing-key boot path, which uses Node builtins (`crypto`/`fs`/`path`) Next.js cannot
  bundle for the Edge runtime an `export function middleware()` would additionally require alongside it. Moving the
  redirect into `next.config.js` (evaluated in the Node.js server context) keeps the exact same behavior (a 308,
  query string preserved, excluding the hub's own `?embed=hub` iframe load) without needing an Edge bundle at all.
- **`/api/health` no longer reports a `migrationHead`.** The original route used `@imajin/db`'s shared
  `createAppHealthHandler`, a monorepo-internal helper this app can no longer depend on (AGENTS.md §2). The new
  route is a small, self-contained database round-trip instead — see that route's doc comment.

## Deploy convention

Own pm2 ecosystem entry (`links`), Caddy-routed under the kernel host at `/links` (unchanged from the monorepo),
port `3102` — the next free dev port after `ima-jin/dykil`'s `3101`, matching the port `@imajin/config`'s own
service manifest already reserves for `links` in the monorepo.
