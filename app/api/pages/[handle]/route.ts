import { NextRequest } from 'next/server';
import { createLogger } from '@ima-jin/logger';
import { authenticate } from '@/lib/auth/authenticate';
import { db, linkPages, links } from '@/db';
import { corsHeaders, corsOptions, errorResponse, jsonResponse } from '@/lib/http';
import { eq, asc, and } from 'drizzle-orm';

const log = createLogger('links');

interface RouteParams {
  params: Promise<{ handle: string }>;
}

export async function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}

/**
 * GET /api/pages/:handle — get a public links page with its active links.
 */
export async function GET(request: NextRequest, props: RouteParams) {
  const { handle } = await props.params;
  const cors = corsHeaders(request);

  try {
    const page = await db.query.linkPages.findFirst({ where: eq(linkPages.handle, handle) });
    if (!page) {
      return errorResponse('Links page not found', 404, cors);
    }
    if (!page.isPublic) {
      return errorResponse('This page is private', 403, cors);
    }

    const pageLinks = await db
      .select()
      .from(links)
      .where(and(eq(links.pageId, page.id), eq(links.isActive, true)))
      .orderBy(asc(links.position));

    return jsonResponse({ ...page, links: pageLinks }, 200, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to fetch links page');
    return errorResponse('Failed to fetch links page', 500, cors);
  }
}

/**
 * PUT /api/pages/:handle — update a links page (owner only).
 */
export async function PUT(request: NextRequest, props: RouteParams) {
  const { handle } = await props.params;
  const cors = corsHeaders(request);

  const authResult = await authenticate(request);
  if ('error' in authResult) {
    return errorResponse(authResult.error, authResult.status, cors);
  }
  const did = authResult.auth.did;

  try {
    const existing = await db.query.linkPages.findFirst({ where: eq(linkPages.handle, handle) });
    if (!existing) {
      return errorResponse('Links page not found', 404, cors);
    }
    if (existing.did !== did) {
      return errorResponse('Not authorized to update this page', 403, cors);
    }

    const body = await request.json();
    const { title, bio, avatar, avatarAssetId, theme, socialLinks, isPublic } = body as {
      title?: string;
      bio?: string;
      avatar?: string;
      avatarAssetId?: string;
      theme?: Record<string, unknown>;
      socialLinks?: Record<string, unknown>;
      isPublic?: boolean;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (bio !== undefined) updates.bio = bio;
    if (avatar !== undefined) updates.avatar = avatar;
    if (avatarAssetId !== undefined) updates.avatarAssetId = avatarAssetId;
    if (theme !== undefined) updates.theme = theme;
    if (socialLinks !== undefined) updates.socialLinks = socialLinks;
    if (isPublic !== undefined) updates.isPublic = isPublic;

    const [updated] = await db.update(linkPages).set(updates).where(eq(linkPages.id, existing.id)).returning();

    return jsonResponse(updated, 200, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to update links page');
    return errorResponse('Failed to update links page', 500, cors);
  }
}

/**
 * DELETE /api/pages/:handle — delete a links page (owner only). Links cascade.
 */
export async function DELETE(request: NextRequest, props: RouteParams) {
  const { handle } = await props.params;
  const cors = corsHeaders(request);

  const authResult = await authenticate(request);
  if ('error' in authResult) {
    return errorResponse(authResult.error, authResult.status, cors);
  }
  const did = authResult.auth.did;

  try {
    const existing = await db.query.linkPages.findFirst({ where: eq(linkPages.handle, handle) });
    if (!existing) {
      return errorResponse('Links page not found', 404, cors);
    }
    if (existing.did !== did) {
      return errorResponse('Not authorized to delete this page', 403, cors);
    }

    await db.delete(linkPages).where(eq(linkPages.id, existing.id));

    return jsonResponse({ deleted: true }, 200, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to delete links page');
    return errorResponse('Failed to delete links page', 500, cors);
  }
}
