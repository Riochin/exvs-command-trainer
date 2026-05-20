import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { practiceAttempts, practiceSessions } from '@/lib/db/schema';
import type { StatsResponse } from '@/features/analytics/types';

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  if (!userId && !clientId) {
    return NextResponse.json({ commandStats: [], dailyPractice: [] } satisfies StatsResponse);
  }

  const filter = userId ? eq(practiceAttempts.userId, userId) : eq(practiceAttempts.clientId, clientId!);
  const sessionFilter = userId ? eq(practiceSessions.userId, userId) : eq(practiceSessions.clientId, clientId!);

  const [attempts, sessions] = await Promise.all([
    db.select().from(practiceAttempts).where(filter),
    db.select({ commandId: practiceSessions.commandId, commandSnapshot: practiceSessions.commandSnapshot })
      .from(practiceSessions).where(sessionFilter),
  ]);

  if (attempts.length === 0) {
    return NextResponse.json({ commandStats: [], dailyPractice: [] } satisfies StatsResponse);
  }

  const commandNameMap: Record<string, string> = {};
  for (const s of sessions) {
    if (!commandNameMap[s.commandId]) {
      try {
        const snap = JSON.parse(s.commandSnapshot) as { name?: string };
        commandNameMap[s.commandId] = snap.name ?? s.commandId;
      } catch {
        commandNameMap[s.commandId] = s.commandId;
      }
    }
  }

  type StatAccum = { totalAttempts: number; successCount: number; totalDurationMs: number; failureSteps: number[] };
  const accumByCommand: Record<string, StatAccum> = {};

  for (const attempt of attempts) {
    if (!accumByCommand[attempt.commandId]) {
      accumByCommand[attempt.commandId] = { totalAttempts: 0, successCount: 0, totalDurationMs: 0, failureSteps: [] };
    }
    const accum = accumByCommand[attempt.commandId];
    accum.totalAttempts++;
    if (attempt.success) accum.successCount++;
    accum.totalDurationMs += attempt.totalDurationMs;
    if (!attempt.success && attempt.failureStep != null) {
      accum.failureSteps.push(attempt.failureStep);
    }
  }

  const commandStats = Object.entries(accumByCommand).map(([commandId, accum]) => {
    const failureCounts: Record<number, number> = {};
    for (const step of accum.failureSteps) {
      failureCounts[step] = (failureCounts[step] ?? 0) + 1;
    }
    const stepFailureRates = Object.entries(failureCounts).map(([step, count]) => ({
      step: Number(step),
      failureCount: count,
      failureRate: accum.totalAttempts > 0 ? count / accum.totalAttempts : 0,
    }));

    return {
      commandId,
      commandName: commandNameMap[commandId] ?? commandId,
      totalAttempts: accum.totalAttempts,
      successCount: accum.successCount,
      successRate: accum.totalAttempts > 0 ? accum.successCount / accum.totalAttempts : 0,
      avgDurationMs: accum.totalAttempts > 0 ? Math.round(accum.totalDurationMs / accum.totalAttempts) : 0,
      stepFailureRates,
    };
  });

  const dailyCounts: Record<string, number> = {};
  for (const attempt of attempts) {
    const date = attempt.createdAt.slice(0, 10);
    dailyCounts[date] = (dailyCounts[date] ?? 0) + 1;
  }
  const dailyPractice = Object.entries(dailyCounts)
    .map(([date, attemptCount]) => ({ date, attemptCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ commandStats, dailyPractice } satisfies StatsResponse);
}
