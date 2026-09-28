import { NextRequest } from 'next/server';
import { createLogger } from '@ima-jin/logger';
import { authenticate } from '@/lib/auth/authenticate';
import { db, linkPages } from '@/db';
import { corsHeaders, corsOptions, errorResponse, jsonResponse } from '@/lib/http';
import { fetchProfileDefaults } from '@/lib/kernel/profile';
import { generateId, themePresets } from '@/lib/utils';
import { eq } from 'drizzle-orm';

const log = createLogger('links');

export async function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}

/**
 * POST /api/pages/auto-create — auto-create a links page from public
 * profile data. Best-effort: falls back to DID-derived defaults if the
 * profile lookup fails (see src/lib/kernel/profile.ts).
 */
export async function POST(request: NextRequest) {
  const cors = corsHeaders(request);
  const authResult = await authenticate(request);
  if ('error' in authResult) {
    return errorResponse(authResult.error, authResult.status, cors);
  }
  const did = authResult.auth.did;

  try {
    const existing = await db.query.linkPages.findFirst({ where: eq(linkPages.did, did) });
    if (existing) {
      return errorResponse('You already have a links page', 409, cors);
    }

    const profile = await fetchProfileDefaults(did);
    const handle = profile?.handle || did.slice(-12);
    const title = profile?.displayName || handle;

    const [page] = await db
      .insert(linkPages)
      .values({
        id: generateId('page'),
        did,
        handle,
        title,
        bio: null,
        avatar: null,
        theme: themePresets.dark,
        socialLinks: {},
        isPublic: true,
      })
      .returning();

    return jsonResponse(page, 201, cors);
  } catch (error) {
    log.error({ err: String(error) }, 'Failed to auto-create links page');
    return errorResponse('Failed to create links page', 500, cors);
  }
}
