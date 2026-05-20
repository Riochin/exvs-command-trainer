import type { ButtonType, Command, PracticeLog } from '@/types';
import type { StatsResponse } from './types';

export interface CreateSessionRequest {
  sessionId: string;
  clientId: string;
  userId: string | null;
  commandId: string;
  commandSnapshot: string;
  deviceType: 'mobile' | 'desktop';
  startedAt: string;
  timeLimitMs?: number;
}

export interface UpdateSessionRequest {
  endedAt: string;
  totalAttempts: number;
  successCount: number;
  durationMs: number;
  abandoned: boolean;
  attemptsToFirstSuccess: number | null;
  bestAttemptMs: number | null;
}

export interface CreateAttemptRequest {
  sessionId: string;
  clientId: string;
  userId: string | null;
  commandId: string;
  attemptIndex: number;
  success: boolean;
  stepReached: number;
  failureStep: number | null;
  totalDurationMs: number;
  stepTimings: Array<{ step: number; duration_ms: number }>;
  inputSequence: ButtonType[] | null;
}

export interface CreatePageViewRequest {
  clientId: string;
  userId: string | null;
  path: string;
  referrer: string | null;
  userAgent: string | null;
}

export interface CreateEventRequest {
  clientId: string;
  userId: string | null;
  eventType: string;
  payload: Record<string, unknown> | null;
}

export interface MigrateRequest {
  commands: Command[];
  practiceLogs: Record<string, PracticeLog>;
}

export interface MigrateResponse {
  migratedCommands: number;
  migratedLogs: number;
}

const jsonPost = (url: string, body: unknown): void => {
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
};

export function postSession(body: CreateSessionRequest): void {
  jsonPost('/api/analytics/sessions', body);
}

export function patchSession(sessionId: string, body: UpdateSessionRequest): void {
  void fetch(`/api/analytics/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export function postAttempt(body: CreateAttemptRequest): void {
  jsonPost('/api/analytics/attempts', body);
}

export function postPageView(body: CreatePageViewRequest): void {
  jsonPost('/api/analytics/pageviews', body);
}

export function postEvent(body: CreateEventRequest): void {
  jsonPost('/api/analytics/events', body);
}

export async function postMigrate(body: MigrateRequest): Promise<MigrateResponse | null> {
  try {
    const res = await fetch('/api/analytics/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as MigrateResponse;
  } catch {
    return null;
  }
}

export async function getStats(clientId: string | null): Promise<StatsResponse | null> {
  try {
    const url = clientId
      ? `/api/analytics/stats?clientId=${encodeURIComponent(clientId)}`
      : '/api/analytics/stats';
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as StatsResponse;
  } catch {
    return null;
  }
}
