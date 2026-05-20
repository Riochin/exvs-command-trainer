import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { practiceSessions } from '@/lib/db/schema';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, clientId, userId, commandId, commandSnapshot, deviceType, startedAt, timeLimitMs } = body as Record<string, unknown>;

  if (!sessionId || !clientId || !commandId || !commandSnapshot || !deviceType || !startedAt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  await db.insert(practiceSessions).values({
    id: sessionId as string,
    clientId: clientId as string,
    userId: (userId as string) ?? null,
    commandId: commandId as string,
    commandSnapshot: commandSnapshot as string,
    deviceType: deviceType as string,
    startedAt: startedAt as string,
    timeLimitMs: timeLimitMs != null ? (timeLimitMs as number) : undefined,
  }).onConflictDoNothing();

  return NextResponse.json({ sessionId });
}
