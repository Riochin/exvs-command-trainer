import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { practiceSessions } from '@/lib/db/schema';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { endedAt, totalAttempts, successCount, durationMs, abandoned, attemptsToFirstSuccess, bestAttemptMs } = body as Record<string, unknown>;

  if (endedAt == null || totalAttempts == null || successCount == null || durationMs == null || abandoned == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { id } = await ctx.params;

  await db.update(practiceSessions).set({
    endedAt: endedAt as string,
    totalAttempts: totalAttempts as number,
    successCount: successCount as number,
    durationMs: durationMs as number,
    abandoned: (abandoned as boolean) ? 1 : 0,
    attemptsToFirstSuccess: attemptsToFirstSuccess != null ? (attemptsToFirstSuccess as number) : null,
    bestAttemptMs: bestAttemptMs != null ? (bestAttemptMs as number) : null,
  }).where(eq(practiceSessions.id, id));

  return NextResponse.json({ ok: true });
}
