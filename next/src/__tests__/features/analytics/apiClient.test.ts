import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  postSession,
  patchSession,
  postAttempt,
  postPageView,
  postEvent,
  postMigrate,
  getStats,
} from '@/features/analytics/apiClient';

describe('analyticsApiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('postSession', () => {
    it('fetch が成功してもエラーを投げない', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      expect(() => postSession({
        sessionId: 'sid-1',
        clientId: 'cid-1',
        userId: null,
        commandId: 'cmd-1',
        commandSnapshot: '{}',
        deviceType: 'mobile',
        startedAt: '2026-01-01T00:00:00.000Z',
      })).not.toThrow();

      // void return — no await needed
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('fetch が失敗してもエラーを投げない', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      expect(() => postSession({
        sessionId: 'sid-1',
        clientId: 'cid-1',
        userId: null,
        commandId: 'cmd-1',
        commandSnapshot: '{}',
        deviceType: 'mobile',
        startedAt: '2026-01-01T00:00:00.000Z',
      })).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('正しいエンドポイントに POST する', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      postSession({
        sessionId: 'sid-1',
        clientId: 'cid-1',
        userId: null,
        commandId: 'cmd-1',
        commandSnapshot: '{}',
        deviceType: 'mobile',
        startedAt: '2026-01-01T00:00:00.000Z',
      });

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/analytics/sessions',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('patchSession', () => {
    it('fetch が失敗してもエラーを投げない', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      expect(() => patchSession('sid-1', {
        endedAt: '2026-01-01T00:01:00.000Z',
        totalAttempts: 5,
        successCount: 3,
        durationMs: 60000,
        abandoned: false,
        attemptsToFirstSuccess: 2,
        bestAttemptMs: 10000,
      })).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('正しいエンドポイントに PATCH する', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      patchSession('sid-1', {
        endedAt: '2026-01-01T00:01:00.000Z',
        totalAttempts: 5,
        successCount: 3,
        durationMs: 60000,
        abandoned: false,
        attemptsToFirstSuccess: 2,
        bestAttemptMs: 10000,
      });

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/analytics/sessions/sid-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('postAttempt', () => {
    it('fetch が失敗してもエラーを投げない', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      expect(() => postAttempt({
        sessionId: 'sid-1',
        clientId: 'cid-1',
        userId: null,
        commandId: 'cmd-1',
        attemptIndex: 0,
        success: true,
        stepReached: 3,
        failureStep: null,
        totalDurationMs: 5000,
        stepTimings: [{ step: 0, duration_ms: 1000 }],
        inputSequence: null,
      })).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  describe('postPageView', () => {
    it('fetch が失敗してもエラーを投げない', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      expect(() => postPageView({
        clientId: 'cid-1',
        userId: null,
        path: '/practice',
        referrer: null,
        userAgent: null,
      })).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  describe('postEvent', () => {
    it('fetch が失敗してもエラーを投げない', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      expect(() => postEvent({
        clientId: 'cid-1',
        userId: null,
        eventType: 'command_created',
        payload: null,
      })).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  describe('postMigrate', () => {
    it('fetch が失敗した場合 null を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await postMigrate({ commands: [], practiceLogs: {} });
      expect(result).toBeNull();
    });

    it('HTTP エラーレスポンスの場合 null を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      }));

      const result = await postMigrate({ commands: [], practiceLogs: {} });
      expect(result).toBeNull();
    });

    it('成功時に MigrateResponse を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ migratedCommands: 3, migratedLogs: 5 }),
      }));

      const result = await postMigrate({ commands: [], practiceLogs: {} });
      expect(result).toEqual({ migratedCommands: 3, migratedLogs: 5 });
    });
  });

  describe('getStats', () => {
    it('fetch が失敗した場合 null を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await getStats('cid-1');
      expect(result).toBeNull();
    });

    it('HTTP エラーレスポンスの場合 null を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      }));

      const result = await getStats('cid-1');
      expect(result).toBeNull();
    });

    it('clientId が null の場合も動作する', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const result = await getStats(null);
      expect(result).toBeNull();
    });

    it('成功時に StatsResponse を返す', async () => {
      const mockData = {
        commandStats: [],
        dailyPractice: [],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      }));

      const result = await getStats('cid-1');
      expect(result).toEqual(mockData);
    });
  });
});
