import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: DrizzleDb | null = null;

/**
 * Lazily constructs (and caches) the drizzle client. Deferred past module
 * load time on purpose: this module is imported by every route handler, and
 * `next build`'s page-data-collection step imports every route without a
 * full runtime `.env.local` in scope. Failing only on first actual query
 * (rather than on cold import) keeps `DATABASE_URL` a genuine runtime
 * requirement without making it a build-time one too.
 */
function getDb(): DrizzleDb {
  if (!cachedDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set.');
    }
    const client = postgres(connectionString, { max: 1 });
    cachedDb = drizzle(client, { schema });
  }
  return cachedDb;
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
export * from './schema';
