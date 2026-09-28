import { NextRequest } from 'next/server';
import { createLogger } from '@ima-jin/logger';
import { db, links, linkClicks } from '@/db';
import { corsHeaders, corsOptions, errorResponse, jsonResponse } from '@/lib/http';
import { extractDomain, generateId } from '@/lib/utils';
import { eq, sql } from 'drizzle-orm';

const log = createLogger('links');

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}

/**
 * POST /api/links/:id/click — record a link click. Public — no auth
 * required. Privacy-preserving: only the referrer domain and an optional
 * reverse-proxy-supplied country are stored, never a full URL, IP, or
 * cookie.
 */
export async function POST(request: NextRequest, props: RouteParams) {
  const { id } = await props.params;
  const cors = corsHeaders(request);

  try {
    const [link] = await db.select().from(links).where(eq(links.id, id)).limit(1);
    if (!link) {
      return errorResponse('Link not found', 404, cors);
    }

    const referrerDomain = extractDomain(request.headers.get('referer'));
    const country = request.headers.get('cf-ipcountry') ?? request.headers.get('x-country') ?? null;

    await db.insert(linkClicks).values({
      id: generateId('click'),
      linkId: id,
      referrer: referrerDomain,
      country,
    });

    await db.update(links).set({ clicks: sql`${links.clicks} + 1` }).where(eq(links.id, id));

    return jsonResponse({ recorded: true }, 200, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to record click');
    // Don't fail the visitor's navigation just because click tracking failed.
    return jsonResponse({ recorded: false }, 200, cors);
  }
}
