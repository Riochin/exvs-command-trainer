import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PracticeSession } from '@/features/practice/PracticeSession';
import { SIMULTANEOUS_INPUT_DEFER_MS } from '@/features/arcade-controller/ArcadeController';
import type { Command } from '@/types';
import { CHARGE_THRESHOLD_MS } from '@/hooks/useChargeInput';

const getControllerButton = (label: string) => screen.getByRole('button', { name: label });

describe('拡張入力タイプの練習フロー', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('チャージ・サブ（リアルタイマー不要）', () => {
    it('sub ステップで射撃+格闘同時押しにより成功判定される', async () => {
      const command: Command = {
        id: 'cmd-sub',
        mobileSuit: 'テスト',
        name: 'サブのみ',
        sequence: [{ buttons: ['sub'] }],
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      render(<PracticeSession command={command} onExit={() => {}} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃'), { pointerId: 1 });
        fireEvent.pointerDown(getControllerButton('格闘'), { pointerId: 2 });
      });
      expect(screen.getByTestId('result-success')).toBeTruthy();
    });
  });

  describe('チャージ（フェイクタイマー）', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('melee-charge ステップで短押しは失敗、長押し後の離しで成功する', async () => {
      const command: Command = {
        id: 'cmd-mcharge',
        mobileSuit: 'テスト',
        name: '格闘チャ',
        sequence: [{ buttons: ['melee-charge'] }],
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      render(<PracticeSession command={command} onExit={() => {}} />);

      const melee = getControllerButton('格闘');
      let t = Date.now();

      await act(async () => {
        fireEvent.pointerDown(melee, { pointerId: 1 });
        vi.setSystemTime(t + CHARGE_THRESHOLD_MS - 1);
        fireEvent.pointerUp(melee, { pointerId: 1 });
        vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
      });
      expect(screen.getByTestId('result-failure')).toBeTruthy();

      t = Date.now();
      await act(async () => {
        fireEvent.pointerDown(melee, { pointerId: 2 });
        vi.setSystemTime(t + CHARGE_THRESHOLD_MS + 50);
        fireEvent.pointerUp(melee, { pointerId: 2 });
        vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
      });
      expect(screen.getByTestId('result-success')).toBeTruthy();
    });
  });
});
