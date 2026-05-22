import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn().mockReturnValue({ data: null, status: 'unauthenticated' }),
}));
vi.mock('@/features/analytics/useAnalytics', () => ({
  useAnalytics: vi.fn().mockReturnValue({
    trackSessionStart: vi.fn(),
    trackAttempt: vi.fn(),
    trackSessionEnd: vi.fn(),
    trackPageView: vi.fn(),
    trackEvent: vi.fn(),
  }),
}));
vi.mock('@/features/analytics/useClientId', () => ({
  useClientId: vi.fn().mockReturnValue({ clientId: 'test-client-id' }),
}));

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

    it('short押し（300ms未満）は失敗、チャージ開始→離しで成功する', async () => {
      const command: Command = {
        id: 'cmd-mcharge',
        mobileSuit: 'テスト',
        name: '格闘チャ',
        sequence: [
          { buttons: ['melee-charge-start'] },
          { buttons: ['melee-charge-end'] },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      render(<PracticeSession command={command} onExit={() => {}} />);

      const melee = getControllerButton('格闘');

      // 短押し（タイマー発火前に離す → タップ → 'melee' → melee-charge-start を期待していたので失敗）
      await act(async () => {
        fireEvent.pointerDown(melee, { pointerId: 1 });
        // タイマーを発火させないまま離す
        fireEvent.pointerUp(melee, { pointerId: 1 });
        vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
      });
      expect(screen.getByTestId('result-failure')).toBeTruthy();

      // 長押し（CHARGE_THRESHOLD_MS 経過で charge-start 発火 → 離して charge-end → 成功）
      // charge-start と charge-end を別の act() に分けて、React が ADVANCE を処理してから
      // charge-end を handleButtonPress に渡せるようにする
      await act(async () => {
        fireEvent.pointerDown(melee, { pointerId: 2 });
        vi.advanceTimersByTime(CHARGE_THRESHOLD_MS); // タイマー発火 → 'melee-charge-start' → dispatch ADVANCE
      });
      await act(async () => {
        fireEvent.pointerUp(melee, { pointerId: 2 });  // → 'melee-charge-end'
      });
      expect(screen.getByTestId('result-success')).toBeTruthy();
    });
  });
});
