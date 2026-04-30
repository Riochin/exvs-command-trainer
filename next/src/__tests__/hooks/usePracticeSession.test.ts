import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { usePracticeSession } from '@/hooks/usePracticeSession';
import type { Command } from '@/types';

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

const singleStepCommand: Command = {
  id: 'cmd-single',
  mobileSuit: 'νガンダム',
  name: '射撃',
  sequence: [{ buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const simultaneousCommand: Command = {
  id: 'cmd-sim',
  mobileSuit: 'νガンダム',
  name: '同時押し',
  sequence: [{ buttons: ['shot', 'melee'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

// start() の dispatch が反映されるまで別 act に分ける
const startSession = (result: ReturnType<typeof renderHook<ReturnType<typeof usePracticeSession>, unknown>>['result'], command: Command) => {
  act(() => { result.current.start(command); });
};

describe('usePracticeSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('初期状態', () => {
    it('status が idle として返る', () => {
      const { result } = renderHook(() => usePracticeSession());
      expect(result.current.state.status).toBe('idle');
    });

    it('command が null として返る', () => {
      const { result } = renderHook(() => usePracticeSession());
      expect(result.current.state.command).toBeNull();
    });

    it('currentIndex が 0 として返る', () => {
      const { result } = renderHook(() => usePracticeSession());
      expect(result.current.state.currentIndex).toBe(0);
    });

    it('attempts が空配列として返る', () => {
      const { result } = renderHook(() => usePracticeSession());
      expect(result.current.state.attempts).toEqual([]);
    });

    it('lastResult が null として返る', () => {
      const { result } = renderHook(() => usePracticeSession());
      expect(result.current.state.lastResult).toBeNull();
    });
  });

  describe('start', () => {
    it('status が active に変わる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      expect(result.current.state.status).toBe('active');
    });

    it('コマンドがセットされる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      expect(result.current.state.command).toEqual(zundaCommand);
    });

    it('currentIndex が 0 になる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      expect(result.current.state.currentIndex).toBe(0);
    });

    it('再 start で attempts がリセットされる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, singleStepCommand);
      act(() => { result.current.handleButtonPress('shot'); }); // 1回試行
      expect(result.current.state.attempts).toHaveLength(1);
      startSession(result, singleStepCommand); // 再開始
      expect(result.current.state.attempts).toHaveLength(0);
    });
  });

  describe('end', () => {
    it('status が completed に変わる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      act(() => { result.current.end(); });
      expect(result.current.state.status).toBe('completed');
    });
  });

  describe('handleButtonPress - idle 時は無視', () => {
    it('status が idle の場合は state が変わらない', () => {
      const { result } = renderHook(() => usePracticeSession());
      act(() => { result.current.handleButtonPress('shot'); });
      expect(result.current.state.status).toBe('idle');
      expect(result.current.state.attempts).toHaveLength(0);
    });
  });

  describe('handleButtonPress - 単押しステップ', () => {
    it('正しいボタンを押すと currentIndex が進む', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      act(() => { result.current.handleButtonPress('jump'); });
      expect(result.current.state.currentIndex).toBe(1);
    });

    it('途中ステップで正しいボタンを押しても lastResult は変わらない', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      act(() => { result.current.handleButtonPress('jump'); });
      expect(result.current.state.lastResult).toBeNull();
    });

    it('最終ステップで正しいボタンを押すと lastResult が success になる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, singleStepCommand);
      act(() => { result.current.handleButtonPress('shot'); });
      expect(result.current.state.lastResult).toBe('success');
    });

    it('成功後は currentIndex が 0 にリセットされる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, singleStepCommand);
      act(() => { result.current.handleButtonPress('shot'); });
      expect(result.current.state.currentIndex).toBe(0);
    });

    it('成功後は attempts に試行が追加される', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, singleStepCommand);
      act(() => { result.current.handleButtonPress('shot'); });
      expect(result.current.state.attempts).toHaveLength(1);
      expect(result.current.state.attempts[0].success).toBe(true);
    });

    it('誤ったボタンを押すと lastResult が failure になる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      act(() => { result.current.handleButtonPress('shot'); }); // 最初のステップは jump
      expect(result.current.state.lastResult).toBe('failure');
    });

    it('誤ったボタンを押すと currentIndex が 0 にリセットされる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      act(() => { result.current.handleButtonPress('jump'); }); // 正解
      act(() => { result.current.handleButtonPress('shot'); }); // 2ステップ目は jump なので誤り
      expect(result.current.state.currentIndex).toBe(0);
      expect(result.current.state.lastResult).toBe('failure');
    });

    it('失敗後は attempts に試行が追加される', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      act(() => { result.current.handleButtonPress('shot'); }); // 誤り
      expect(result.current.state.attempts).toHaveLength(1);
      expect(result.current.state.attempts[0].success).toBe(false);
    });
  });

  describe('handleButtonPress - ズンダコマンド', () => {
    it('ジャンプ→ジャンプ→射撃で3ステップ目の射撃で成功判定される', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      act(() => { result.current.handleButtonPress('jump'); }); // ステップ1
      expect(result.current.state.currentIndex).toBe(1);
      act(() => { result.current.handleButtonPress('jump'); }); // ステップ2
      expect(result.current.state.currentIndex).toBe(2);
      act(() => { result.current.handleButtonPress('shot'); }); // ステップ3 = 成功
      expect(result.current.state.lastResult).toBe('success');
      expect(result.current.state.currentIndex).toBe(0);
    });

    it('成功後すぐに次の試行を開始できる', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      act(() => { result.current.handleButtonPress('jump'); });
      act(() => { result.current.handleButtonPress('jump'); });
      act(() => { result.current.handleButtonPress('shot'); }); // 1回目成功
      act(() => { result.current.handleButtonPress('jump'); }); // 2回目開始
      expect(result.current.state.currentIndex).toBe(1);
    });

    it('複数回の試行結果が蓄積される', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, zundaCommand);
      // 1回目: 成功
      act(() => { result.current.handleButtonPress('jump'); });
      act(() => { result.current.handleButtonPress('jump'); });
      act(() => { result.current.handleButtonPress('shot'); });
      // 2回目: 失敗
      act(() => { result.current.handleButtonPress('shot'); });
      expect(result.current.state.attempts).toHaveLength(2);
      expect(result.current.state.attempts[0].success).toBe(true);
      expect(result.current.state.attempts[1].success).toBe(false);
    });
  });

  describe('handleButtonPress - 同時押しステップ', () => {
    it('必要なボタンが全て揃うと成功判定される', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, simultaneousCommand);
      act(() => { result.current.handleButtonPress('shot'); });
      act(() => { result.current.handleButtonPress('melee'); });
      expect(result.current.state.lastResult).toBe('success');
    });

    it('同時押しステップの途中ボタンでは判定しない', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, simultaneousCommand);
      act(() => { result.current.handleButtonPress('shot'); }); // まだ melee が必要
      expect(result.current.state.lastResult).toBeNull();
      expect(result.current.state.currentIndex).toBe(0);
    });

    it('同時押しステップで不要なボタンを押すと失敗', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, simultaneousCommand);
      act(() => { result.current.handleButtonPress('jump'); }); // shot+melee が必要
      expect(result.current.state.lastResult).toBe('failure');
    });
  });

  describe('usePracticeLog との連携', () => {
    it('成功時に ct_practice_logs に記録される', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, singleStepCommand);
      act(() => { result.current.handleButtonPress('shot'); });
      const raw = localStorage.getItem('ct_practice_logs');
      expect(raw).not.toBeNull();
      const logs = JSON.parse(raw!) as Record<string, { attempts: { success: boolean }[] }>;
      expect(logs['cmd-single']).toBeDefined();
      expect(logs['cmd-single'].attempts[0].success).toBe(true);
    });

    it('失敗時に ct_practice_logs に記録される', () => {
      const { result } = renderHook(() => usePracticeSession());
      startSession(result, singleStepCommand);
      act(() => { result.current.handleButtonPress('jump'); }); // 誤り
      const raw = localStorage.getItem('ct_practice_logs');
      expect(raw).not.toBeNull();
      const logs = JSON.parse(raw!) as Record<string, { attempts: { success: boolean }[] }>;
      expect(logs['cmd-single'].attempts[0].success).toBe(false);
    });
  });
});
