import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { usePracticeLog } from '@/hooks/usePracticeLog';
import type { PracticeAttempt, PracticeLog } from '@/types';

const LOG_KEY = 'ct_practice_logs';

const successAttempt: PracticeAttempt = { success: true, timestamp: '2026-04-29T10:00:00.000Z' };
const failAttempt: PracticeAttempt = { success: false, timestamp: '2026-04-29T10:01:00.000Z' };

describe('usePracticeLog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('初期状態', () => {
    it('isLoading が false として返る', () => {
      const { result } = renderHook(() => usePracticeLog());
      expect(result.current.isLoading).toBe(false);
    });

    it('lastError が null として返る', () => {
      const { result } = renderHook(() => usePracticeLog());
      expect(result.current.lastError).toBeNull();
    });
  });

  describe('getLog', () => {
    it('存在しないコマンド ID のログは null を返す', () => {
      const { result } = renderHook(() => usePracticeLog());
      expect(result.current.getLog('nonexistent')).toBeNull();
    });

    it('保存済みのログを取得できる', () => {
      const logs: Record<string, PracticeLog> = {
        'cmd-1': { commandId: 'cmd-1', attempts: [successAttempt] },
      };
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
      const { result } = renderHook(() => usePracticeLog());
      const log = result.current.getLog('cmd-1');
      expect(log).not.toBeNull();
      expect(log?.commandId).toBe('cmd-1');
      expect(log?.attempts).toHaveLength(1);
    });

    it('取得したログに試行結果が含まれる', () => {
      const logs: Record<string, PracticeLog> = {
        'cmd-1': { commandId: 'cmd-1', attempts: [successAttempt, failAttempt] },
      };
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
      const { result } = renderHook(() => usePracticeLog());
      const log = result.current.getLog('cmd-1');
      expect(log?.attempts[0].success).toBe(true);
      expect(log?.attempts[1].success).toBe(false);
    });
  });

  describe('recordAttempt', () => {
    it('試行結果を記録し StorageResult ok: true を返す', () => {
      const { result } = renderHook(() => usePracticeLog());
      let res!: ReturnType<typeof result.current.recordAttempt>;
      act(() => {
        res = result.current.recordAttempt('cmd-1', successAttempt);
      });
      expect(res.ok).toBe(true);
    });

    it('recordAttempt 後 getLog が追記された試行結果を返す', () => {
      const { result } = renderHook(() => usePracticeLog());
      act(() => {
        result.current.recordAttempt('cmd-1', successAttempt);
      });
      const log = result.current.getLog('cmd-1');
      expect(log).not.toBeNull();
      expect(log?.attempts).toHaveLength(1);
      expect(log?.attempts[0].success).toBe(true);
    });

    it('同一コマンドに複数の試行を追記できる', () => {
      const { result } = renderHook(() => usePracticeLog());
      act(() => {
        result.current.recordAttempt('cmd-1', successAttempt);
        result.current.recordAttempt('cmd-1', failAttempt);
      });
      const log = result.current.getLog('cmd-1');
      expect(log?.attempts).toHaveLength(2);
    });

    it('ログが存在しない場合は新規作成される', () => {
      const { result } = renderHook(() => usePracticeLog());
      act(() => {
        result.current.recordAttempt('new-cmd', successAttempt);
      });
      const log = result.current.getLog('new-cmd');
      expect(log).not.toBeNull();
      expect(log?.commandId).toBe('new-cmd');
    });

    it('localStorage の ct_practice_logs キーに永続化される', () => {
      const { result } = renderHook(() => usePracticeLog());
      act(() => {
        result.current.recordAttempt('cmd-1', successAttempt);
      });
      const raw = localStorage.getItem(LOG_KEY);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw!) as Record<string, PracticeLog>;
      expect(stored['cmd-1']).toBeDefined();
      expect(stored['cmd-1'].attempts).toHaveLength(1);
    });

    it('複数コマンドのログを独立して管理できる', () => {
      const { result } = renderHook(() => usePracticeLog());
      act(() => {
        result.current.recordAttempt('cmd-1', successAttempt);
        result.current.recordAttempt('cmd-2', failAttempt);
      });
      expect(result.current.getLog('cmd-1')?.attempts[0].success).toBe(true);
      expect(result.current.getLog('cmd-2')?.attempts[0].success).toBe(false);
    });
  });

  describe('clearLog', () => {
    it('指定コマンドのログを全削除できる', () => {
      const { result } = renderHook(() => usePracticeLog());
      act(() => {
        result.current.recordAttempt('cmd-1', successAttempt);
      });
      act(() => {
        result.current.clearLog('cmd-1');
      });
      expect(result.current.getLog('cmd-1')).toBeNull();
    });

    it('他コマンドのログに影響しない', () => {
      const { result } = renderHook(() => usePracticeLog());
      act(() => {
        result.current.recordAttempt('cmd-1', successAttempt);
        result.current.recordAttempt('cmd-2', failAttempt);
      });
      act(() => {
        result.current.clearLog('cmd-1');
      });
      expect(result.current.getLog('cmd-2')).not.toBeNull();
    });

    it('存在しないコマンド ID を clearLog しても例外が発生しない', () => {
      const { result } = renderHook(() => usePracticeLog());
      expect(() => {
        act(() => {
          result.current.clearLog('no-such-cmd');
        });
      }).not.toThrow();
    });
  });
});
