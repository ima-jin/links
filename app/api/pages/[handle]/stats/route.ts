import { NextRequest } from 'next/server';
import { createLogger } from '@ima-jin/logger';
import { authenticate } from '@/lib/auth/authenticate';
import { db, linkPages, links, linkClicks } from '@/db';
import { corsHeaders, corsOptions, errorResponse, jsonResponse } from '@/lib/http';
import { eq, sql, desc } from 'drizzle-orm';

const log = createLogger('links');

interface RouteParams {
  params: Promise<{ handle: string }>;
}

export async function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}

/**
 * GET /api/pages/:handle/stats — page click statistics (owner only), last 30 days.
 */
export async function GET(request: NextRequest, props: RouteParams) {
  const { handle } = await props.params;
  const cors = corsHeaders(request);

  const authResult = await authenticate(request);
  if ('error' in authResult) {
    return errorResponse(authResult.error, authResult.status, cors);
  }
  const did = authResult.auth.did;

  try {
    const page = await db.query.linkPages.findFirst({ where: eq(linkPages.handle, handle) });
    if (!page) {
      return errorResponse('Links page not found', 404, cors);
    }
    if (page.did !== did) {
      return errorResponse('Not authorized to view stats', 403, cors);
    }

    const pageLinks = await db.select().from(links).where(eq(links.pageId, page.id)).orderBy(desc(links.clicks));
    const totalClicks = pageLinks.reduce((sum, link) => sum + link.clicks, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const linkIds = pageLinks.map((l) => l.id);

    let clicksByDay: { date: string; clicks: number }[] = [];
    let topReferrers: { referrer: string; clicks: number }[] = [];

    if (linkIds.length > 0) {
      const dailyClicks = await db
        .select({
          date: sql<string>`date_trunc('day', ${linkClicks.clickedAt})::date`,
          clicks: sql<number>`count(*)`,
        })
        .from(linkClicks)
        .where(sql`${linkClicks.linkId} = ANY(${linkIds}) AND ${linkClicks.clickedAt} >= ${thirtyDaysAgo}`)
        .groupBy(sql`date_trunc('day', ${linkClicks.clickedAt})::date`)
        .orderBy(desc(sql`date_trunc('day', ${linkClicks.clickedAt})::date`));

      clicksByDay = dailyClicks.map((d) => ({ date: d.date, clicks: Number(d.clicks) }));

      const referrers = await db
        .select({ referrer: linkClicks.referrer, clicks: sql<number>`count(*)` })
        .from(linkClicks)
        .where(sql`${linkClicks.linkId} = ANY(${linkIds}) AND ${linkClicks.referrer} IS NOT NULL`)
        .groupBy(linkClicks.referrer)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      topReferrers = referrers.map((r) => ({ referrer: r.referrer || 'Direct', clicks: Number(r.clicks) }));
    }

    return jsonResponse(
      {
        totalClicks,
        clicksByLink: pageLinks.map((l) => ({ id: l.id, title: l.title, url: l.url, clicks: l.clicks })),
        clicksByDay,
        topReferrers,
      },
      200,
      cors,
    );
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to fetch stats');
    return errorResponse('Failed to fetch stats', 500, cors);
  }
}
