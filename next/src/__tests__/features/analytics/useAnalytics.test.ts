import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

vi.mock('@/features/analytics/apiClient', () => ({
  postSession: vi.fn(),
  patchSession: vi.fn(),
  postAttempt: vi.fn(),
  postPageView: vi.fn(),
  postEvent: vi.fn(),
}));

vi.mock('@/features/analytics/useClientId', () => ({
  useClientId: vi.fn().mockReturnValue({ clientId: 'test-client-id' }),
}));

import { useSession } from 'next-auth/react';
import * as apiClient from '@/features/analytics/apiClient';
import { useAnalytics } from '@/features/analytics/useAnalytics';

const mockUseSession = vi.mocked(useSession);
const mockPostSession = vi.mocked(apiClient.postSession);
const mockPatchSession = vi.mocked(apiClient.patchSession);
const mockPostAttempt = vi.mocked(apiClient.postAttempt);
const mockPostPageView = vi.mocked(apiClient.postPageView);
const mockPostEvent = vi.mocked(apiClient.postEvent);

const unauthenticatedSession = { data: null, status: 'unauthenticated' as const, update: vi.fn() };
const authenticatedSession = {
  data: { user: { id: 'user-123', name: 'Test User', email: 'test@example.com', image: null }, expires: '2099-01-01' },
  status: 'authenticated' as const,
  update: vi.fn(),
};

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trackSessionStart', () => {
    it('未認証時に postSession を clientId と null userId で呼ぶ', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);

      const { result } = renderHook(() => useAnalytics());

      act(() => {
        result.current.trackSessionStart({
          sessionId: 'sid-1',
          commandId: 'cmd-1',
          commandSnapshot: '{}',
          deviceType: 'mobile',
        });
      });

      expect(mockPostSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sid-1',
          clientId: 'test-client-id',
          userId: null,
          commandId: 'cmd-1',
          commandSnapshot: '{}',
          deviceType: 'mobile',
        }),
      );
    });

    it('認証済み時に postSession を userId 付きで呼ぶ', () => {
      mockUseSession.mockReturnValue(authenticatedSession);

      const { result } = renderHook(() => useAnalytics());

      act(() => {
        result.current.trackSessionStart({
          sessionId: 'sid-1',
          commandId: 'cmd-1',
          commandSnapshot: '{}',
          deviceType: 'desktop',
        });
      });

      expect(mockPostSession).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123', deviceType: 'desktop' }),
      );
    });

    it('戻り値がなく例外を投げない', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);
      const { result } = renderHook(() => useAnalytics());

      expect(() => {
        act(() => {
          const ret = result.current.trackSessionStart({
            sessionId: 'sid-1',
            commandId: 'cmd-1',
            commandSnapshot: '{}',
            deviceType: 'mobile',
          });
          expect(ret).toBeUndefined();
        });
      }).not.toThrow();
    });
  });

  describe('trackAttempt', () => {
    it('postAttempt を clientId・userId 付きで呼ぶ', () => {
      mockUseSession.mockReturnValue(authenticatedSession);

      const { result } = renderHook(() => useAnalytics());

      act(() => {
        result.current.trackAttempt({
          sessionId: 'sid-1',
          commandId: 'cmd-1',
          attemptIndex: 0,
          success: true,
          stepReached: 3,
          failureStep: null,
          totalDurationMs: 5000,
          stepTimings: [{ step: 0, duration_ms: 1000 }],
          inputSequence: null,
        });
      });

      expect(mockPostAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sid-1',
          clientId: 'test-client-id',
          userId: 'user-123',
          commandId: 'cmd-1',
          attemptIndex: 0,
          success: true,
        }),
      );
    });

    it('戻り値がなく例外を投げない', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);
      const { result } = renderHook(() => useAnalytics());

      expect(() => {
        act(() => {
          const ret = result.current.trackAttempt({
            sessionId: 'sid-1',
            commandId: 'cmd-1',
            attemptIndex: 0,
            success: false,
            stepReached: 1,
            failureStep: 1,
            totalDurationMs: 2000,
            stepTimings: [],
            inputSequence: ['shot'],
          });
          expect(ret).toBeUndefined();
        });
      }).not.toThrow();
    });
  });

  describe('trackSessionEnd', () => {
    it('patchSession を sessionId 付きで呼ぶ', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);

      const { result } = renderHook(() => useAnalytics());

      act(() => {
        result.current.trackSessionEnd('sid-1', {
          endedAt: '2026-01-01T00:01:00.000Z',
          totalAttempts: 5,
          successCount: 3,
          durationMs: 60000,
          abandoned: false,
          attemptsToFirstSuccess: 2,
          bestAttemptMs: 10000,
        });
      });

      expect(mockPatchSession).toHaveBeenCalledWith(
        'sid-1',
        expect.objectContaining({
          totalAttempts: 5,
          successCount: 3,
          durationMs: 60000,
          abandoned: false,
        }),
      );
    });

    it('戻り値がなく例外を投げない', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);
      const { result } = renderHook(() => useAnalytics());

      expect(() => {
        act(() => {
          const ret = result.current.trackSessionEnd('sid-1', {
            endedAt: '2026-01-01T00:01:00.000Z',
            totalAttempts: 1,
            successCount: 0,
            durationMs: 1000,
            abandoned: true,
            attemptsToFirstSuccess: null,
            bestAttemptMs: null,
          });
          expect(ret).toBeUndefined();
        });
      }).not.toThrow();
    });
  });

  describe('trackPageView', () => {
    it('postPageView を clientId・userId・path 付きで呼ぶ', () => {
      mockUseSession.mockReturnValue(authenticatedSession);

      const { result } = renderHook(() => useAnalytics());

      act(() => {
        result.current.trackPageView('/practice');
      });

      expect(mockPostPageView).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'test-client-id',
          userId: 'user-123',
          path: '/practice',
        }),
      );
    });

    it('戻り値がなく例外を投げない', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);
      const { result } = renderHook(() => useAnalytics());

      expect(() => {
        act(() => {
          const ret = result.current.trackPageView('/');
          expect(ret).toBeUndefined();
        });
      }).not.toThrow();
    });
  });

  describe('trackEvent', () => {
    it('postEvent を clientId・userId・eventType 付きで呼ぶ', () => {
      mockUseSession.mockReturnValue(authenticatedSession);

      const { result } = renderHook(() => useAnalytics());

      act(() => {
        result.current.trackEvent('command_created', { mobileSuit: 'ストライクフリーダム', stepCount: 3 });
      });

      expect(mockPostEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'test-client-id',
          userId: 'user-123',
          eventType: 'command_created',
          payload: { mobileSuit: 'ストライクフリーダム', stepCount: 3 },
        }),
      );
    });

    it('payload 省略時に null を渡す', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);

      const { result } = renderHook(() => useAnalytics());

      act(() => {
        result.current.trackEvent('free_play_used');
      });

      expect(mockPostEvent).toHaveBeenCalledWith(
        expect.objectContaining({ payload: null }),
      );
    });

    it('戻り値がなく例外を投げない', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);
      const { result } = renderHook(() => useAnalytics());

      expect(() => {
        act(() => {
          const ret = result.current.trackEvent('command_deleted');
          expect(ret).toBeUndefined();
        });
      }).not.toThrow();
    });
  });
});
