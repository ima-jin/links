import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { createLogger } from '@ima-jin/logger';
import { isAppClaimed } from '@/lib/auth/signing-identity';

const log = createLogger('links');

/**
 * GET /api/health — this app's own health check.
 *
 * Unlike the original in-monorepo `apps/links` (which used `@imajin/db`'s
 * shared `createAppHealthHandler`, a monorepo-internal helper this app is
 * no longer allowed to depend on — AGENTS.md §2), this is a small,
 * self-contained round-trip against this app's own database. A failed
 * query reports `degraded` rather than throwing, so the route itself never
 * 500s just because the database is briefly unreachable.
 */
export async function GET() {
  let dbOk = true;
  try {
    const { db } = await import('@/db');
    await db.execute(sql`select 1`);
  } catch (error) {
    dbOk = false;
    log.error({ err: String(error) }, 'Health check: database round-trip failed');
  }

  return NextResponse.json(
    {
      status: dbOk ? 'ok' : 'degraded',
      service: 'links',
      timestamp: new Date().toISOString(),
      // Unclaimed boot mode (imajin-ai#2427): false until an operator pastes a
      // claim code at /claim (or IMAJIN_APP_CLAIM_CODE resolves it at boot).
      claimed: isAppClaimed(),
    },
    { status: dbOk ? 200 : 503 },
  );
}
