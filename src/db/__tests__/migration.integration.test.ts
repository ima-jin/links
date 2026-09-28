import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Exercises the ACTUAL migrated schema against a real Postgres instance —
 * unlike every other test in this repo, `@/db` is NOT mocked here. Skipped
 * entirely when `DATABASE_URL` isn't set (e.g. a plain local `pnpm test`
 * with no database running), so this never blocks normal development.
 *
 * Wired into CI (`.github/workflows/ci.yml`) against a `postgres` service
 * container: `pnpm db:migrate` runs first, then this file proves the
 * generated `migrations/0000_*.sql` actually matches `src/db/schema.ts` —
 * catching drift between the two that a mocked unit test never could.
 */
describe.skipIf(!process.env.DATABASE_URL)('migrated schema (real database)', () => {
  let dbModule: typeof import('../index');
  const pageId = 'page_migration_test';
  const linkId = 'link_migration_test';

  beforeAll(async () => {
    dbModule = await import('../index');
  });

  afterAll(async () => {
    const { db, linkPages } = dbModule;
    await db.delete(linkPages).where(eq(linkPages.id, pageId));
  });

  it('accepts a page, a link, and a click exactly as the app writes them', async () => {
    const { db, linkPages, links, linkClicks } = dbModule;

    const [page] = await db
      .insert(linkPages)
      .values({
        id: pageId,
        did: 'did:imajin:migration-test',
        handle: 'migration_test_handle',
        title: 'Migration Test',
        theme: { backgroundColor: '#000000' },
        socialLinks: {},
        isPublic: true,
      })
      .returning();
    expect(page.handle).toBe('migration_test_handle');

    const [link] = await db
      .insert(links)
      .values({ id: linkId, pageId, title: 'GitHub', url: 'https://github.com' })
      .returning();
    expect(link.pageId).toBe(pageId);

    await db.insert(linkClicks).values({ id: 'click_migration_test', linkId, referrer: 'example.com' });

    const foundLink = await db.query.links.findFirst({ where: eq(links.id, linkId) });
    expect(foundLink?.title).toBe('GitHub');
  });

  it('cascades link/click deletes when the owning page is deleted', async () => {
    const { db, linkPages, links } = dbModule;

    await db.delete(linkPages).where(eq(linkPages.id, pageId));

    const remainingLink = await db.query.links.findFirst({ where: eq(links.id, linkId) });
    expect(remainingLink).toBeUndefined();
  });
});
