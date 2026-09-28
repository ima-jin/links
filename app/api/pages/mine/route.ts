import { NextRequest } from 'next/server';
import { createLogger } from '@ima-jin/logger';
import { authenticate } from '@/lib/auth/authenticate';
import { db, linkPages, links } from '@/db';
import { corsHeaders, corsOptions, errorResponse, jsonResponse } from '@/lib/http';
import { eq, asc } from 'drizzle-orm';

const log = createLogger('links');

export async function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}

/**
 * GET /api/pages/mine — get the authenticated caller's own links page with
 * all links. Returns `{ page: null }` if they haven't created one yet.
 */
export async function GET(request: NextRequest) {
  const cors = corsHeaders(request);
  const authResult = await authenticate(request);
  if ('error' in authResult) {
    return errorResponse(authResult.error, authResult.status, cors);
  }
  const did = authResult.auth.did;

  try {
    const page = await db.query.linkPages.findFirst({ where: eq(linkPages.did, did) });
    if (!page) {
      return jsonResponse({ page: null }, 200, cors);
    }

    const pageLinks = await db.select().from(links).where(eq(links.pageId, page.id)).orderBy(asc(links.position));

    return jsonResponse({ ...page, links: pageLinks }, 200, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to fetch my links page');
    return errorResponse('Failed to fetch links page', 500, cors);
  }
}
