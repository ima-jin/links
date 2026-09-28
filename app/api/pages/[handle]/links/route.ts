import { NextRequest } from 'next/server';
import { createLogger } from '@ima-jin/logger';
import { authenticate } from '@/lib/auth/authenticate';
import { db, linkPages, links } from '@/db';
import { corsHeaders, corsOptions, errorResponse, jsonResponse } from '@/lib/http';
import { generateId, isValidUrl } from '@/lib/utils';
import { eq, max } from 'drizzle-orm';

const log = createLogger('links');

interface RouteParams {
  params: Promise<{ handle: string }>;
}

interface NewLinkInput {
  title?: string;
  url?: string;
  icon?: string;
  thumbnail?: string;
  position?: number;
  isActive?: boolean;
  visibility?: string;
}

export async function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}

/**
 * POST /api/pages/:handle/links — add one or more links to a page (owner only).
 */
export async function POST(request: NextRequest, props: RouteParams) {
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
      return errorResponse('Not authorized to add links to this page', 403, cors);
    }

    const body = await request.json();
    const { links: newLinks } = body as { links?: NewLinkInput[] };

    if (!newLinks || !Array.isArray(newLinks) || newLinks.length === 0) {
      return errorResponse('links array is required', 400, cors);
    }

    const maxPosResult = await db.select({ maxPos: max(links.position) }).from(links).where(eq(links.pageId, page.id));
    let currentPos = (maxPosResult[0]?.maxPos ?? 0) + 1;

    const linksToInsert = [];
    for (const link of newLinks) {
      if (!link.title) {
        return errorResponse('Each link must have a title', 400, cors);
      }
      if (!link.url || !isValidUrl(link.url)) {
        return errorResponse(`Invalid URL: ${link.url}`, 400, cors);
      }

      const position = link.position === undefined ? currentPos : link.position;
      if (link.position === undefined) currentPos += 1;

      linksToInsert.push({
        id: generateId('link'),
        pageId: page.id,
        title: link.title,
        url: link.url,
        icon: link.icon ?? null,
        thumbnail: link.thumbnail ?? null,
        position,
        isActive: link.isActive !== false,
        visibility: link.visibility ?? 'public',
      });
    }

    const inserted = await db.insert(links).values(linksToInsert).returning();

    return jsonResponse({ links: inserted }, 201, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to add links');
    return errorResponse('Failed to add links', 500, cors);
  }
}
