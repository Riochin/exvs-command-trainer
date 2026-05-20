'use client';

import { useSession } from 'next-auth/react';
import type { ButtonType } from '@/types';
import {
  postSession,
  patchSession,
  postAttempt,
  postPageView,
  postEvent,
} from './apiClient';
import { useClientId } from './useClientId';

export type AnalyticsEventType =
  | 'command_created'
  | 'command_deleted'
  | 'free_play_used';

export interface TrackSessionStartParams {
  sessionId: string;
  commandId: string;
  commandSnapshot: string;
  deviceType: 'mobile' | 'desktop';
  timeLimitMs?: number;
}

export interface AttemptAnalyticsData {
  sessionId: string;
  commandId: string;
  attemptIndex: number;
  success: boolean;
  stepReached: number;
  failureStep: number | null;
  totalDurationMs: number;
  stepTimings: Array<{ step: number; duration_ms: number }>;
  inputSequence: ButtonType[] | null;
}

export interface TrackSessionEndParams {
  endedAt: string;
  totalAttempts: number;
  successCount: number;
  durationMs: number;
  abandoned: boolean;
  attemptsToFirstSuccess: number | null;
  bestAttemptMs: number | null;
}

export interface UseAnalyticsReturn {
  trackSessionStart(params: TrackSessionStartParams): void;
  trackAttempt(data: AttemptAnalyticsData): void;
  trackSessionEnd(sessionId: string, params: TrackSessionEndParams): void;
  trackPageView(path: string): void;
  trackEvent(type: AnalyticsEventType, payload?: Record<string, unknown>): void;
}

export function useAnalytics(): UseAnalyticsReturn {
  const { data: session } = useSession();
  const { clientId } = useClientId();
  const userId = session?.user?.id ?? null;

  const trackSessionStart = (params: TrackSessionStartParams): void => {
    postSession({
      sessionId: params.sessionId,
      clientId,
      userId,
      commandId: params.commandId,
      commandSnapshot: params.commandSnapshot,
      deviceType: params.deviceType,
      startedAt: new Date().toISOString(),
      timeLimitMs: params.timeLimitMs,
    });
  };

  const trackAttempt = (data: AttemptAnalyticsData): void => {
    postAttempt({
      sessionId: data.sessionId,
      clientId,
      userId,
      commandId: data.commandId,
      attemptIndex: data.attemptIndex,
      success: data.success,
      stepReached: data.stepReached,
      failureStep: data.failureStep,
      totalDurationMs: data.totalDurationMs,
      stepTimings: data.stepTimings,
      inputSequence: data.inputSequence,
    });
  };

  const trackSessionEnd = (sessionId: string, params: TrackSessionEndParams): void => {
    patchSession(sessionId, params);
  };

  const trackPageView = (path: string): void => {
    postPageView({
      clientId,
      userId,
      path,
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent || null : null,
    });
  };

  const trackEvent = (type: AnalyticsEventType, payload?: Record<string, unknown>): void => {
    postEvent({
      clientId,
      userId,
      eventType: type,
      payload: payload ?? null,
    });
  };

  return { trackSessionStart, trackAttempt, trackSessionEnd, trackPageView, trackEvent };
}
