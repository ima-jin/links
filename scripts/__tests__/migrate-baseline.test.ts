import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertIdentifier,
  BaselineMismatchError,
  compareSchema,
  expectedSchema,
  readBaselineMigration,
  runBaseline,
} from '../lib/migrate-baseline-core.mjs';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));
const CLI = fileURLToPath(new URL('../migrate-baseline.mjs', import.meta.url));
const BASELINE_SQL_FILE = `${MIGRATIONS_FOLDER}/0000_freezing_silvermane.sql`;
const SCHEMA = 'links';

type RunnerSql = Parameters<typeof runBaseline>[0];
type Options = { dryRun?: boolean };

function run(sql: unknown, options: Options = {}) {
  return runBaseline(sql as RunnerSql, { schema: SCHEMA, migrationsFolder: MIGRATIONS_FOLDER, ...options });
}

/** Minimal child env — never inherits the caller's DATABASE_URL & friends. */
function childEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv;
}

describe('assertIdentifier', () => {
  it('accepts plain lower-case identifiers', () => {
    expect(assertIdentifier('links', 'x')).toBe('links');
    expect(assertIdentifier('app_links_2', 'x')).toBe('app_links_2');
  });

  it.each(['', 'Links', 'links; DROP SCHEMA links', 'a"b', '1links', 'a-b'])('rejects %j', (value) => {
    expect(() => assertIdentifier(value, 'APP_DB_SCHEMA')).toThrow(/APP_DB_SCHEMA must match/);
  });
});

describe('readBaselineMigration', () => {
  it('hashes the first journal entry exactly like drizzle-orm does', async () => {
    const baseline = await readBaselineMigration(MIGRATIONS_FOLDER);
    const [drizzleFirst] = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });

    expect(baseline.hash).toBe(drizzleFirst.hash);
    expect(baseline.when).toBe(drizzleFirst.folderMillis);
    expect(baseline.hash).toBe(createHash('sha256').update(readFileSync(BASELINE_SQL_FILE, 'utf8')).digest('hex'));
  });
});

describe('compareSchema', () => {
  const fresh = () => structuredClone(expectedSchema(SCHEMA));

  it('accepts an identical schema', () => {
    expect(compareSchema(fresh(), expectedSchema(SCHEMA))).toEqual([]);
  });

  it('tolerates extra indexes (harmless) and different constraint names', () => {
    const actual = fresh();
    actual.pages.indexes.push({ name: 'idx_extra', columns: ['bio'], method: 'btree' });
    expect(compareSchema(actual, expectedSchema(SCHEMA))).toEqual([]);
  });

  it('reports a missing table', () => {
    const actual = fresh() as Record<string, unknown>;
    delete actual.clicks;
    expect(compareSchema(actual as ReturnType<typeof expectedSchema>, expectedSchema(SCHEMA))).toEqual([
      'clicks: table is missing',
    ]);
  });

  it('reports an unexpected table', () => {
    const actual = { ...fresh(), stray: structuredClone(fresh().clicks) };
    expect(compareSchema(actual, expectedSchema(SCHEMA))).toEqual(['stray: unexpected table in the app schema']);
  });

  it('reports missing, extra, retyped, nullability and default drift on columns', () => {
    const actual = fresh();
    delete (actual.pages.columns as Record<string, unknown>).bio;
    (actual.pages.columns as Record<string, unknown>).surprise = { type: 'text', notNull: false, default: null };
    actual.links.columns.url.type = 'character varying(255)';
    actual.links.columns.title.notNull = false;
    actual.links.columns.clicks.default = null;

    expect(compareSchema(actual, expectedSchema(SCHEMA))).toEqual([
      'pages.bio: column is missing',
      'pages.surprise: unexpected column',
      'links.title: NOT NULL is false, expected true',
      'links.url: type is character varying(255), expected text',
      'links.clicks: default is none, expected 0',
    ]);
  });

  it('reports key, FK and index drift', () => {
    const actual = fresh();
    actual.pages.primaryKey = ['did'];
    actual.pages.unique = [['did']];
    actual.links.foreignKeys[0].onDelete = 'no action';
    actual.clicks.indexes = [];

    const problems = compareSchema(actual, expectedSchema(SCHEMA));
    expect(problems).toHaveLength(5);
    expect(problems.join('\n')).toMatch(/pages: primary key is \(did\), expected \(id\)/);
    expect(problems.join('\n')).toMatch(/pages: unique constraints/);
    expect(problems.join('\n')).toMatch(/links: foreign keys/);
    expect(problems.join('\n')).toMatch(/clicks: index idx_link_clicks_link is missing/);
    expect(problems.join('\n')).toMatch(/clicks: index idx_link_clicks_date is missing/);
  });

  it('reports a reshaped index', () => {
    const actual = fresh();
    actual.links.indexes[1].columns = ['page_id'];
    expect(compareSchema(actual, expectedSchema(SCHEMA))).toEqual([
      'links: index idx_links_position is btree(page_id), expected btree(page_id, position)',
    ]);
  });
});

/**
 * The shape the monorepo's shared seed (imajin-ai migrations/0001_seed.sql)
 * left in prod/dev: same tables and constraints as this repo's migration
 * 0000, but with the seed's own PK constraint names and column order.
 */
const PROD_LIKE_SCHEMA_SQL = [
  'CREATE SCHEMA IF NOT EXISTS links',
  `CREATE TABLE links.pages (
    id text NOT NULL, did text NOT NULL, handle text NOT NULL, title text NOT NULL,
    bio text, avatar text, theme jsonb DEFAULT '{}'::jsonb NOT NULL,
    social_links jsonb DEFAULT '{}'::jsonb, is_public boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(), avatar_asset_id text)`,
  `CREATE TABLE links.links (
    id text NOT NULL, page_id text NOT NULL, title text NOT NULL, url text NOT NULL,
    icon text, thumbnail text, "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true, clicks integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    visibility text DEFAULT 'public'::text NOT NULL)`,
  `CREATE TABLE links.clicks (
    id text NOT NULL, link_id text NOT NULL,
    clicked_at timestamp with time zone DEFAULT now(), referrer text, country text)`,
  'ALTER TABLE ONLY links.clicks ADD CONSTRAINT link_clicks_pkey PRIMARY KEY (id)',
  'ALTER TABLE ONLY links.pages ADD CONSTRAINT link_pages_pkey PRIMARY KEY (id)',
  'ALTER TABLE ONLY links.links ADD CONSTRAINT links_pkey PRIMARY KEY (id)',
  'ALTER TABLE ONLY links.pages ADD CONSTRAINT pages_did_unique UNIQUE (did)',
  'ALTER TABLE ONLY links.pages ADD CONSTRAINT pages_handle_unique UNIQUE (handle)',
  'CREATE INDEX idx_link_clicks_date ON links.clicks USING btree (clicked_at)',
  'CREATE INDEX idx_link_clicks_link ON links.clicks USING btree (link_id)',
  'CREATE INDEX idx_link_pages_did ON links.pages USING btree (did)',
  'CREATE INDEX idx_link_pages_handle ON links.pages USING btree (handle)',
  'CREATE INDEX idx_links_page ON links.links USING btree (page_id)',
  'CREATE INDEX idx_links_position ON links.links USING btree (page_id, "position")',
  `ALTER TABLE ONLY links.clicks ADD CONSTRAINT clicks_link_id_links_id_fk
     FOREIGN KEY (link_id) REFERENCES links.links(id) ON DELETE CASCADE`,
  `ALTER TABLE ONLY links.links ADD CONSTRAINT links_page_id_pages_id_fk
     FOREIGN KEY (page_id) REFERENCES links.pages(id) ON DELETE CASCADE`,
];

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('migrate-baseline against a real Postgres', () => {
  let admin: postgres.Sql;
  let dbName: string;
  let url: string;
  let sql: postgres.Sql;

  beforeEach(async () => {
    admin = postgres(databaseUrl as string, { max: 1, onnotice: () => {} });
    dbName = `links_baseline_${randomBytes(6).toString('hex')}`;
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    const parsed = new URL(databaseUrl as string);
    parsed.pathname = `/${dbName}`;
    url = parsed.toString();
    sql = postgres(url, { max: 1, onnotice: () => {} });
  });

  afterEach(async () => {
    await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  });

  async function seedProdLike() {
    for (const statement of PROD_LIKE_SCHEMA_SQL) {
      await sql.unsafe(statement);
    }
    await sql.unsafe(`INSERT INTO links.pages (id, did, handle, title) VALUES ('p1', 'did:imajin:a', 'a', 'A')`);
    await sql.unsafe(`INSERT INTO links.links (id, page_id, title, url) VALUES ('l1', 'p1', 'T', 'https://example.com')`);
    await sql.unsafe(`INSERT INTO links.clicks (id, link_id) VALUES ('c1', 'l1')`);
  }

  async function rowCounts() {
    const [row] = await sql.unsafe(
      `SELECT (SELECT count(*) FROM links.pages)::int AS pages,
              (SELECT count(*) FROM links.links)::int AS links,
              (SELECT count(*) FROM links.clicks)::int AS clicks`,
    );
    return row;
  }

  async function trackingRows() {
    return sql.unsafe(`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`);
  }

  async function trackingExists() {
    const [row] = await sql.unsafe(`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`);
    return row.present as boolean;
  }

  /** Wraps the client so every statement the baseline issues can be audited. */
  function recording(statements: string[]) {
    return {
      begin: (fn: (tx: unknown) => Promise<unknown>) =>
        sql.begin((tx) =>
          fn({
            unsafe: (text: string, params?: unknown[]) => {
              statements.push(text);
              return tx.unsafe(text, params as never);
            },
          }),
        ),
    };
  }

  describe('baselining an existing, prod-shaped schema', () => {
    it('records migration 0000 and leaves every table and row untouched', async () => {
      await seedProdLike();
      const before = await rowCounts();
      const expected = await readBaselineMigration(MIGRATIONS_FOLDER);

      const result = await run(sql);

      expect(result).toEqual({ status: 'baselined', tag: expected.tag });
      expect(await rowCounts()).toEqual(before);
      const rows = await trackingRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].hash).toBe(expected.hash);
      expect(Number(rows[0].created_at)).toBe(expected.when);
    });

    it('is idempotent — a second and third run change nothing', async () => {
      await seedProdLike();
      await run(sql);

      const second = await run(sql);
      const third = await run(sql);

      expect(second.status).toBe('already-baselined');
      expect(third.status).toBe('already-baselined');
      expect(await trackingRows()).toHaveLength(1);
      expect(await rowCounts()).toEqual({ pages: 1, links: 1, clicks: 1 });
    });

    it('leaves drizzle-kit/drizzle migrate a clean no-op afterwards (no CREATE SCHEMA collision)', async () => {
      await seedProdLike();
      await run(sql);

      await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });

      expect(await rowCounts()).toEqual({ pages: 1, links: 1, clicks: 1 });
      expect(await trackingRows()).toHaveLength(1);
    });

    it('without the baseline, migrate fails on the existing schema (why this script exists)', async () => {
      await seedProdLike();
      await expect(migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER })).rejects.toThrow();
    });

    it('accepts a schema produced by migration 0000 itself (expectation cannot drift from the SQL)', async () => {
      await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
      expect((await run(sql)).status).toBe('already-baselined');

      // Same schema, but without drizzle's record of it: must validate and baseline.
      await sql.unsafe('DROP SCHEMA drizzle CASCADE');
      expect((await run(sql)).status).toBe('baselined');
    });

    it('dry run validates but writes nothing', async () => {
      await seedProdLike();

      const result = await run(sql, { dryRun: true });

      expect(result.status).toBe('would-baseline');
      expect(await trackingExists()).toBe(false);
    });
  });

  describe('fresh database', () => {
    it('does nothing and creates nothing, leaving the schema to db:migrate', async () => {
      const statements: string[] = [];

      const result = await run(recording(statements));

      expect(result.status).toBe('fresh-database');
      expect(statements.filter((s) => !/^\s*SELECT\b/i.test(s))).toEqual([]);
      expect(await trackingExists()).toBe(false);
      const [schemas] = await sql.unsafe(
        `SELECT count(*)::int AS n FROM pg_namespace WHERE nspname IN ('links', 'drizzle')`,
      );
      expect(schemas.n).toBe(0);
      await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
      expect((await run(sql)).status).toBe('already-baselined');
    });
  });

  describe('refuses on mismatch', () => {
    async function expectRefusal(pattern: RegExp) {
      const before = await rowCounts();
      await expect(run(sql)).rejects.toBeInstanceOf(BaselineMismatchError);
      await expect(run(sql)).rejects.toThrow(pattern);
      expect(await trackingExists()).toBe(false);
      expect(await rowCounts()).toEqual(before);
    }

    it('when a column is missing', async () => {
      await seedProdLike();
      await sql.unsafe('ALTER TABLE links.pages DROP COLUMN avatar_asset_id');
      await expectRefusal(/pages\.avatar_asset_id: column is missing/);
    });

    it('when a column has an unexpected type', async () => {
      await seedProdLike();
      await sql.unsafe('ALTER TABLE links.links ALTER COLUMN url TYPE varchar(100)');
      await expectRefusal(/links\.url: type is character varying\(100\), expected text/);
    });

    it('when an unknown table lives in the app schema', async () => {
      await seedProdLike();
      await sql.unsafe('CREATE TABLE links.stray (id text)');
      await expectRefusal(/stray: unexpected table/);
    });

    it('when a foreign key is missing', async () => {
      await seedProdLike();
      await sql.unsafe('ALTER TABLE links.links DROP CONSTRAINT links_page_id_pages_id_fk');
      await expectRefusal(/links: foreign keys/);
    });

    it('when a required index is missing', async () => {
      await seedProdLike();
      await sql.unsafe('DROP INDEX links.idx_links_position');
      await expectRefusal(/idx_links_position is missing/);
    });

    it('when the schema exists but is empty', async () => {
      await sql.unsafe('CREATE SCHEMA links');
      await expect(run(sql)).rejects.toThrow(/pages: table is missing/);
      expect(await trackingExists()).toBe(false);
    });

    it('when the tracking table holds history that does not include migration 0000', async () => {
      await seedProdLike();
      await sql.unsafe('CREATE SCHEMA drizzle');
      await sql.unsafe('CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
      await sql.unsafe(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('someone-elses-hash', 1)`);

      await expect(run(sql)).rejects.toThrow(/unrecognised migration history/);
      expect(await trackingRows()).toHaveLength(1);
    });

    it('when APP_DB_SCHEMA is not a safe identifier', () => {
      expect(() =>
        runBaseline(sql as unknown as RunnerSql, { schema: 'links; DROP SCHEMA links', migrationsFolder: MIGRATIONS_FOLDER }),
      ).toThrow(/APP_DB_SCHEMA must match/);
    });
  });

  describe('never drops, truncates, or alters anything', () => {
    const DESTRUCTIVE = /\b(DROP|TRUNCATE|ALTER|DELETE|UPDATE|GRANT|REVOKE|RENAME)\b/i;

    it('only ever issues SELECTs plus create-only bookkeeping DDL (successful run)', async () => {
      await seedProdLike();
      const statements: string[] = [];

      await run(recording(statements));

      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        expect(statement).not.toMatch(DESTRUCTIVE);
      }
      const writes = statements.filter((s) => !/^\s*(SELECT|WITH)\b/i.test(s));
      expect(writes).toHaveLength(3);
      expect(writes[0]).toMatch(/^CREATE SCHEMA IF NOT EXISTS "drizzle"$/);
      expect(writes[1]).toMatch(/^CREATE TABLE IF NOT EXISTS "drizzle"\."__drizzle_migrations"/);
      expect(writes[2]).toMatch(/^INSERT INTO "drizzle"\."__drizzle_migrations"/);
      for (const statement of statements) {
        expect(statement).not.toMatch(/\blinks\b\s*\./i);
      }
    });

    it('issues no write at all when it refuses', async () => {
      await seedProdLike();
      await sql.unsafe('ALTER TABLE links.pages DROP COLUMN bio');
      const statements: string[] = [];

      await expect(run(recording(statements))).rejects.toBeInstanceOf(BaselineMismatchError);

      expect(statements.filter((s) => !/^\s*SELECT\b/i.test(s))).toEqual([]);
    });

    it('issues no write at all on a re-run or a dry run', async () => {
      await seedProdLike();
      const dryRun: string[] = [];
      const options = { schema: SCHEMA, migrationsFolder: MIGRATIONS_FOLDER, dryRun: true };
      await runBaseline(recording(dryRun) as RunnerSql, options);
      await run(sql);
      const rerun: string[] = [];
      await run(recording(rerun));

      expect(dryRun.filter((s) => !/^\s*SELECT\b/i.test(s))).toEqual([]);
      expect(rerun.filter((s) => !/^\s*SELECT\b/i.test(s))).toEqual([]);
    });
  });

  describe('CLI', () => {
    function cli(env: Record<string, string>, args: string[] = []) {
      return spawnSync(process.execPath, [CLI, ...args], {
        env: childEnv(env),
        encoding: 'utf8',
      });
    }

    it('exits 0 on baseline, then 0 again (idempotent), without echoing the connection string', async () => {
      await seedProdLike();

      const first = cli({ DATABASE_URL: url });
      const second = cli({ DATABASE_URL: url });

      expect(first.status).toBe(0);
      expect(first.stdout).toMatch(/Baselined: recorded 0000_/);
      expect(second.status).toBe(0);
      expect(second.stdout).toMatch(/Already baselined/);
      expect(first.stdout + first.stderr + second.stdout + second.stderr).not.toContain(new URL(url).password || 'no-password-in-url');
    });

    it('exits 1 with a clear error on mismatch and changes nothing', async () => {
      await seedProdLike();
      await sql.unsafe('ALTER TABLE links.pages DROP COLUMN bio');

      const result = cli({ DATABASE_URL: url });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Refusing to baseline/);
      expect(result.stderr).toMatch(/pages\.bio: column is missing/);
      expect(await trackingExists()).toBe(false);
    });

    it('--dry-run exits 0 and writes nothing', async () => {
      await seedProdLike();

      const result = cli({ DATABASE_URL: url }, ['--dry-run']);

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Dry run/);
      expect(await trackingExists()).toBe(false);
    });

    it('honours APP_DB_SCHEMA (a missing schema of that name is a fresh database)', () => {
      const result = cli({ DATABASE_URL: url, APP_DB_SCHEMA: 'other_app' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Fresh database/);
    });
  });
});

describe('migrate-baseline CLI configuration errors (no database needed)', () => {
  const run2 = (env: Record<string, string>, args: string[] = []) =>
    spawnSync(process.execPath, [CLI, ...args], { env: childEnv(env), encoding: 'utf8' });

  it('exits 2 when DATABASE_URL is missing', () => {
    const result = run2({});
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/DATABASE_URL is not set/);
  });

  it('exits 2 on an unknown argument', () => {
    const result = run2({ DATABASE_URL: 'postgres://127.0.0.1:1/x' }, ['--force']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Unknown argument/);
  });

  it('exits 2 on an unsafe APP_DB_SCHEMA before touching the database', () => {
    const result = run2({ DATABASE_URL: 'postgres://127.0.0.1:1/x', APP_DB_SCHEMA: 'x; DROP SCHEMA y' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/APP_DB_SCHEMA must match/);
  });
});
