import { NextRequest } from 'next/server';
import { createLogger } from '@ima-jin/logger';
import { authenticate } from '@/lib/auth/authenticate';
import { db, linkPages, links } from '@/db';
import { corsHeaders, corsOptions, errorResponse, jsonResponse } from '@/lib/http';
import { isValidUrl } from '@/lib/utils';
import { eq } from 'drizzle-orm';

const log = createLogger('links');

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}

/**
 * PUT /api/links/:id — update a single link (owner only).
 */
export async function PUT(request: NextRequest, props: RouteParams) {
  const { id } = await props.params;
  const cors = corsHeaders(request);

  const authResult = await authenticate(request);
  if ('error' in authResult) {
    return errorResponse(authResult.error, authResult.status, cors);
  }
  const did = authResult.auth.did;

  try {
    const [link] = await db.select().from(links).where(eq(links.id, id)).limit(1);
    if (!link) {
      return errorResponse('Link not found', 404, cors);
    }

    const page = await db.query.linkPages.findFirst({ where: eq(linkPages.id, link.pageId) });
    if (!page || page.did !== did) {
      return errorResponse('Not authorized to update this link', 403, cors);
    }

    const body = await request.json();
    const { title, url, icon, thumbnail, position, isActive, visibility } = body as {
      title?: string;
      url?: string;
      icon?: string;
      thumbnail?: string;
      position?: number;
      isActive?: boolean;
      visibility?: string;
    };

    if (url && !isValidUrl(url)) {
      return errorResponse('Invalid URL', 400, cors);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (url !== undefined) updates.url = url;
    if (icon !== undefined) updates.icon = icon;
    if (thumbnail !== undefined) updates.thumbnail = thumbnail;
    if (position !== undefined) updates.position = position;
    if (isActive !== undefined) updates.isActive = isActive;
    if (visibility !== undefined) updates.visibility = visibility;

    const [updated] = await db.update(links).set(updates).where(eq(links.id, id)).returning();

    return jsonResponse(updated, 200, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to update link');
    return errorResponse('Failed to update link', 500, cors);
  }
}

/**
 * DELETE /api/links/:id — delete a link (owner only).
 */
export async function DELETE(request: NextRequest, props: RouteParams) {
  const { id } = await props.params;
  const cors = corsHeaders(request);

  const authResult = await authenticate(request);
  if ('error' in authResult) {
    return errorResponse(authResult.error, authResult.status, cors);
  }
  const did = authResult.auth.did;

  try {
    const [link] = await db.select().from(links).where(eq(links.id, id)).limit(1);
    if (!link) {
      return errorResponse('Link not found', 404, cors);
    }

    const page = await db.query.linkPages.findFirst({ where: eq(linkPages.id, link.pageId) });
    if (!page || page.did !== did) {
      return errorResponse('Not authorized to delete this link', 403, cors);
    }

    await db.delete(links).where(eq(links.id, id));

    return jsonResponse({ deleted: true }, 200, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to delete link');
    return errorResponse('Failed to delete link', 500, cors);
  }
}
