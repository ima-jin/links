import { boolean, index, integer, jsonb, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * This app owns exactly one Postgres schema, named by `APP_DB_SCHEMA` (see
 * .env.example and docs/MIGRATIONS.md) — never a kernel schema or another
 * app's schema. Ported from the original in-monorepo `apps/links`, which
 * already owned this exact schema (`links.pages` / `links.links` /
 * `links.clicks`, seeded in `imajin-ai`'s shared root `migrations/`); this
 * repo now owns its own migration history for the same tables.
 *
 * Defaults to `'links'` rather than throwing when unset (unlike the bare
 * template, whose schema name is genuinely per-fork configurable): this
 * app's schema name is fixed by the extraction ruling, and this module is
 * imported by every route handler, including during `next build`'s
 * page-data collection step, which runs without a full `.env.local`.
 */
const appSchemaName = process.env.APP_DB_SCHEMA || 'links';

export const appSchema = pgSchema(appSchemaName);

/**
 * Link pages — bio link pages linked to DIDs. One page per DID.
 */
export const linkPages = appSchema.table('pages', {
  id: text('id').primaryKey(),                                 // page_xxx
  did: text('did').notNull().unique(),                         // Owner DID
  handle: text('handle').notNull().unique(),                   // URL slug
  title: text('title').notNull(),                              // Display name
  bio: text('bio'),                                            // Short description
  avatar: text('avatar'),                                      // Image URL or emoji
  avatarAssetId: text('avatar_asset_id'),                      // Opaque id a client may pass; this app never resolves it itself
  theme: jsonb('theme').notNull().default({}),                 // Theme settings
  socialLinks: jsonb('social_links').default({}),              // Social media handles
  isPublic: boolean('is_public').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  handleIdx: index('idx_link_pages_handle').on(table.handle),
  didIdx: index('idx_link_pages_did').on(table.did),
}));

/**
 * Links — individual links on a page.
 */
export const links = appSchema.table('links', {
  id: text('id').primaryKey(),                                 // link_xxx
  pageId: text('page_id').references(() => linkPages.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  icon: text('icon'),                                          // Emoji or icon name
  thumbnail: text('thumbnail'),                                // Image URL
  position: integer('position').notNull().default(0),
  isActive: boolean('is_active').default(true),
  visibility: text('visibility').notNull().default('public'),  // 'public' | 'authenticated'
  clicks: integer('clicks').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  pageIdx: index('idx_links_page').on(table.pageId),
  positionIdx: index('idx_links_position').on(table.pageId, table.position),
}));

/**
 * Link clicks — minimal, privacy-preserving click tracking (no PII, no
 * cookies, no IP addresses stored).
 */
export const linkClicks = appSchema.table('clicks', {
  id: text('id').primaryKey(),
  linkId: text('link_id').references(() => links.id, { onDelete: 'cascade' }).notNull(),
  clickedAt: timestamp('clicked_at', { withTimezone: true }).defaultNow(),
  referrer: text('referrer'),                                  // Referrer domain only
  country: text('country'),                                    // Country, if provided by a reverse proxy header
}, (table) => ({
  linkIdx: index('idx_link_clicks_link').on(table.linkId),
  dateIdx: index('idx_link_clicks_date').on(table.clickedAt),
}));

export type LinkPage = typeof linkPages.$inferSelect;
export type NewLinkPage = typeof linkPages.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type LinkClick = typeof linkClicks.$inferSelect;
