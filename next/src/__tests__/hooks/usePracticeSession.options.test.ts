import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePracticeSession } from '@/hooks/usePracticeSession';
import type { AttemptAnalyticsData } from '@/hooks/usePracticeSession';
import type { Command } from '@/types';

const singleStepCommand: Command = {
  id: 'cmd-single',
  mobileSuit: 'νガンダム',
  name: '射撃',
  sequence: [{ buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const zundaCommand: Command = {
  id: 'cmd-zunda',
  mobileSuit: 'ストライクフリーダム',
  name: 'ズンダ',
  sequence: [
    { buttons: ['jump'] },
    { buttons: ['jump'] },
    { buttons: ['shot'] },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('UsePracticeSessionOptions コールバック', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('options 未指定での既存互換性', () => {
    it('options なしで start() を呼んでも status が active になる', () => {
      const { result } = renderHook(() => usePracticeSession());
      act(() => { result.current.start(singleStepCommand); });
      expect(result.current.state.status).toBe('active');
    });

    it('options なしで成功試行が記録される', () => {
      const { result } = renderHook(() => usePracticeSession());
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); });
      expect(result.current.state.attempts).toHaveLength(1);
      expect(result.current.state.attempts[0].success).toBe(true);
    });
  });

  describe('onSessionStart', () => {
    it('start() 時に onSessionStart が JSON.stringify(command) で呼ばれる', () => {
      const onSessionStart = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionStart }));
      act(() => { result.current.start(singleStepCommand); });
      expect(onSessionStart).toHaveBeenCalledOnce();
      expect(onSessionStart).toHaveBeenCalledWith(JSON.stringify(singleStepCommand));
    });

    it('再 start() 時も onSessionStart が再度呼ばれる', () => {
      const onSessionStart = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionStart }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.start(singleStepCommand); });
      expect(onSessionStart).toHaveBeenCalledTimes(2);
    });
  });

  describe('onAttemptComplete - 成功', () => {
    it('成功時に success:true で onAttemptComplete が呼ばれる', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ sessionId: 'session-1', onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); });
      expect(onAttemptComplete).toHaveBeenCalledOnce();
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.success).toBe(true);
    });

    it('成功時の sessionId が options.sessionId と一致する', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ sessionId: 'my-session', onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.sessionId).toBe('my-session');
    });

    it('成功時の commandId がコマンドの id と一致する', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.commandId).toBe('cmd-single');
    });

    it('成功時の stepReached は最終ステップインデックス', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.stepReached).toBe(0);
    });

    it('多ステップコマンドの成功時 stepReached は最終インデックス', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(zundaCommand); });
      act(() => { result.current.handleButtonPress('jump'); });
      act(() => { result.current.handleButtonPress('jump'); });
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.stepReached).toBe(2);
    });

    it('成功時の failureStep は null', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.failureStep).toBeNull();
    });

    it('成功時の stepTimings にすべてのステップが含まれる（ズンダは3ステップ）', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(zundaCommand); });
      vi.advanceTimersByTime(100);
      act(() => { result.current.handleButtonPress('jump'); });
      vi.advanceTimersByTime(200);
      act(() => { result.current.handleButtonPress('jump'); });
      vi.advanceTimersByTime(300);
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.stepTimings).toHaveLength(3);
      expect(data.stepTimings[0].step).toBe(0);
      expect(data.stepTimings[1].step).toBe(1);
      expect(data.stepTimings[2].step).toBe(2);
      expect(data.stepTimings[0].duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('成功時の totalDurationMs は 0 以上', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      vi.advanceTimersByTime(150);
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('成功時の inputSequence に押したボタンが含まれる', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.inputSequence).toContain('shot');
    });
  });

  describe('onAttemptComplete - 失敗', () => {
    it('失敗時に success:false で onAttemptComplete が呼ばれる', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(zundaCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // jump が正解
      expect(onAttemptComplete).toHaveBeenCalledOnce();
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.success).toBe(false);
    });

    it('失敗時の stepReached と failureStep は失敗ステップインデックス', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(zundaCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // ステップ0で失敗
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.stepReached).toBe(0);
      expect(data.failureStep).toBe(0);
    });

    it('多ステップ途中失敗の stepReached と failureStep が正しい', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(zundaCommand); });
      act(() => { result.current.handleButtonPress('jump'); }); // ステップ0正解
      act(() => { result.current.handleButtonPress('shot'); }); // ステップ1失敗
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.stepReached).toBe(1);
      expect(data.failureStep).toBe(1);
    });

    it('失敗時の stepTimings に失敗ステップまでの計測値が含まれる', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(zundaCommand); });
      act(() => { result.current.handleButtonPress('jump'); }); // ステップ0正解
      act(() => { result.current.handleButtonPress('shot'); }); // ステップ1失敗
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.stepTimings).toHaveLength(2);
    });

    it('失敗時の inputSequence に押したボタンが含まれる', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(zundaCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // 失敗
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.inputSequence).toContain('shot');
    });
  });

  describe('attemptIndex', () => {
    it('最初の試行の attemptIndex は 0', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); });
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[0][0];
      expect(data.attemptIndex).toBe(0);
    });

    it('2回目の試行の attemptIndex は 1', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // 1回目成功
      act(() => { result.current.handleButtonPress('shot'); }); // 2回目
      const data2: AttemptAnalyticsData = onAttemptComplete.mock.calls[1][0];
      expect(data2.attemptIndex).toBe(1);
    });

    it('再 start() で attemptIndex がリセットされる', () => {
      const onAttemptComplete = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onAttemptComplete }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // 1回目
      act(() => { result.current.start(singleStepCommand); }); // 再スタート
      act(() => { result.current.handleButtonPress('shot'); }); // 再スタート後1回目
      const data: AttemptAnalyticsData = onAttemptComplete.mock.calls[1][0];
      expect(data.attemptIndex).toBe(0);
    });
  });

  describe('onSessionEnd', () => {
    it('end() 時に onSessionEnd が totalAttempts と successCount で呼ばれる', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // 成功1回
      act(() => { result.current.end(); });
      expect(onSessionEnd).toHaveBeenCalledOnce();
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.totalAttempts).toBe(1);
      expect(stats.successCount).toBe(1);
    });

    it('end() 時の durationMs は 0 以上', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      vi.advanceTimersByTime(500);
      act(() => { result.current.end(); });
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('最初の試行で成功の場合 attemptsToFirstSuccess は 1', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // 1回目成功
      act(() => { result.current.end(); });
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.attemptsToFirstSuccess).toBe(1);
    });

    it('失敗後に成功した場合 attemptsToFirstSuccess は 2', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('jump'); }); // 失敗
      act(() => { result.current.handleButtonPress('shot'); }); // 成功
      act(() => { result.current.end(); });
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.attemptsToFirstSuccess).toBe(2);
    });

    it('成功がない場合 attemptsToFirstSuccess は null', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('jump'); }); // 失敗のみ
      act(() => { result.current.end(); });
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.attemptsToFirstSuccess).toBeNull();
    });

    it('成功がない場合 bestAttemptMs は null', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('jump'); }); // 失敗のみ
      act(() => { result.current.end(); });
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.bestAttemptMs).toBeNull();
    });

    it('成功がある場合 bestAttemptMs は null でない', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // 成功
      act(() => { result.current.end(); });
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.bestAttemptMs).not.toBeNull();
      expect(stats.bestAttemptMs).toBeGreaterThanOrEqual(0);
    });

    it('成功がない場合 abandoned は true', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('jump'); }); // 失敗
      act(() => { result.current.end(); });
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.abandoned).toBe(true);
    });

    it('成功がある場合 abandoned は false', () => {
      const onSessionEnd = vi.fn();
      const { result } = renderHook(() => usePracticeSession({ onSessionEnd }));
      act(() => { result.current.start(singleStepCommand); });
      act(() => { result.current.handleButtonPress('shot'); }); // 成功
      act(() => { result.current.end(); });
      const stats = onSessionEnd.mock.calls[0][0];
      expect(stats.abandoned).toBe(false);
    });
  });
});
