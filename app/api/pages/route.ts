import { NextRequest } from 'next/server';
import { createLogger } from '@ima-jin/logger';
import { authenticate } from '@/lib/auth/authenticate';
import { db, linkPages } from '@/db';
import { corsHeaders, corsOptions, errorResponse, jsonResponse } from '@/lib/http';
import { generateId, isValidHandle, themePresets, type ThemePresetName } from '@/lib/utils';
import { eq } from 'drizzle-orm';

const log = createLogger('links');

export async function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}

/**
 * POST /api/pages — create a new links page. One page per DID.
 */
export async function POST(request: NextRequest) {
  const cors = corsHeaders(request);
  const authResult = await authenticate(request);
  if ('error' in authResult) {
    return errorResponse(authResult.error, authResult.status, cors);
  }
  const did = authResult.auth.did;

  try {
    const body = await request.json();
    const { handle, title, bio, avatar, avatarAssetId, theme, themePreset, socialLinks } = body as {
      handle?: string;
      title?: string;
      bio?: string;
      avatar?: string;
      avatarAssetId?: string;
      theme?: Record<string, unknown>;
      themePreset?: string;
      socialLinks?: Record<string, unknown>;
    };

    if (!handle) {
      return errorResponse('handle is required', 400, cors);
    }
    if (!title) {
      return errorResponse('title is required', 400, cors);
    }
    if (!isValidHandle(handle)) {
      return errorResponse('Handle must be 3-30 characters, lowercase alphanumeric and underscores only', 400, cors);
    }

    const existingDid = await db.query.linkPages.findFirst({ where: eq(linkPages.did, did) });
    if (existingDid) {
      return errorResponse('You already have a links page', 409, cors);
    }

    const existingHandle = await db.query.linkPages.findFirst({ where: eq(linkPages.handle, handle) });
    if (existingHandle) {
      return errorResponse('Handle is already taken', 409, cors);
    }

    const resolvedTheme =
      themePreset && themePreset in themePresets
        ? themePresets[themePreset as ThemePresetName]
        : theme ?? themePresets.dark;

    const [page] = await db
      .insert(linkPages)
      .values({
        id: generateId('page'),
        did,
        handle,
        title,
        bio: bio ?? null,
        avatar: avatar ?? null,
        avatarAssetId: avatarAssetId ?? null,
        theme: resolvedTheme,
        socialLinks: socialLinks ?? {},
        isPublic: true,
      })
      .returning();

    return jsonResponse(page, 201, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to create links page');
    return errorResponse('Failed to create links page', 500, cors);
  }
}
