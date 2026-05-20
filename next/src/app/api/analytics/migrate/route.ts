import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { practiceSessions, practiceAttempts } from '@/lib/db/schema';
import type { Command, PracticeLog } from '@/types';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { commands: Command[]; practiceLogs: Record<string, PracticeLog> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { commands, practiceLogs } = body;

  let migratedLogs = 0;

  for (const command of commands) {
    const log = practiceLogs[command.id];
    if (!log?.attempts?.length) continue;

    const sessionId = uuidv4();
    const startedAt = log.attempts[0].timestamp;
    const endedAt = log.attempts[log.attempts.length - 1].timestamp;
    const successCount = log.attempts.filter((a) => a.success).length;

    await db.insert(practiceSessions).values({
      id: sessionId,
      userId,
      clientId: userId,
      commandId: command.id,
      commandSnapshot: JSON.stringify(command),
      deviceType: 'unknown',
      startedAt,
      endedAt,
      totalAttempts: log.attempts.length,
      successCount,
      abandoned: 0,
    }).onConflictDoNothing();

    for (let i = 0; i < log.attempts.length; i++) {
      const attempt = log.attempts[i];
      await db.insert(practiceAttempts).values({
        id: uuidv4(),
        sessionId,
        userId,
        clientId: userId,
        commandId: command.id,
        attemptIndex: i,
        success: attempt.success ? 1 : 0,
        stepReached: attempt.success ? command.sequence.length : 0,
        failureStep: null,
        totalDurationMs: 0,
        stepTimings: '[]',
        inputSequence: null,
        createdAt: attempt.timestamp,
      }).onConflictDoNothing();

      migratedLogs++;
    }
  }

  return NextResponse.json({ migratedCommands: commands.length, migratedLogs });
}
