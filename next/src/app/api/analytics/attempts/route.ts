import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/client';
import { practiceAttempts } from '@/lib/db/schema';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, clientId, userId, commandId, attemptIndex, success, stepReached, failureStep, totalDurationMs, stepTimings, inputSequence } = body as Record<string, unknown>;

  if (!sessionId || !clientId || !commandId || attemptIndex == null || success == null || stepReached == null || totalDurationMs == null || !stepTimings) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  await db.insert(practiceAttempts).values({
    id: uuidv4(),
    sessionId: sessionId as string,
    clientId: clientId as string,
    userId: (userId as string) ?? null,
    commandId: commandId as string,
    attemptIndex: attemptIndex as number,
    success: (success as boolean) ? 1 : 0,
    stepReached: stepReached as number,
    failureStep: failureStep != null ? (failureStep as number) : null,
    totalDurationMs: totalDurationMs as number,
    stepTimings: JSON.stringify(stepTimings),
    inputSequence: inputSequence != null ? JSON.stringify(inputSequence) : null,
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
