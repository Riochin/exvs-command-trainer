import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
import { flushChargeDeferredInput } from '@/__tests__/utils/flushChargeDeferredInput';
import { flushBdDetection } from '@/__tests__/utils/flushBdDetection';
import type { Command } from '@/types';

// ジャンプ→ジャンプ→射撃 の順で入力するコマンド（ズンダは BD→射撃→BD）
const jumpJumpShotCommand: Command = {
  id: 'cmd-jjs',
  mobileSuit: 'ストライクフリーダム',
  name: 'ジャンプ→ジャンプ→射撃',
  sequence: [
    { buttons: ['jump'] },
    { buttons: ['jump'] },
    { buttons: ['shot'] },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function pressControllerButton(label: string) {
  await act(async () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: label }));
    fireEvent.pointerUp(screen.getByRole('button', { name: label }));
  });
  if (label === '射撃' || label === '格闘') {
    await flushChargeDeferredInput();
  }
  if (label === 'ジャンプ') {
    await flushBdDetection();
  }
}

describe('ジャンプ→ジャンプ→射撃コマンド練習 E2E テスト', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ジャンプ→ジャンプ→射撃の順で入力すると成功判定される', async () => {
    render(<PracticeSession command={jumpJumpShotCommand} onExit={() => {}} />);
    await pressControllerButton('ジャンプ');
    await pressControllerButton('ジャンプ');
    await pressControllerButton('射撃');
    expect(screen.getByTestId('result-success')).toBeTruthy();
  });

  it('練習終了後のサマリで 1 回成功したとき成功率 100% が表示される', async () => {
    render(<PracticeSession command={jumpJumpShotCommand} onExit={() => {}} />);

    await pressControllerButton('ジャンプ');
    await pressControllerButton('ジャンプ');
    await pressControllerButton('射撃');

    fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

    expect(screen.getByTestId('session-result')).toBeTruthy();
    expect(screen.getByTestId('success-rate').textContent).toContain('100');
  });

  it('2 回試行（成功1・失敗1）後のサマリで成功率 50% と試行数が正しく表示される', async () => {
    render(<PracticeSession command={jumpJumpShotCommand} onExit={() => {}} />);

    // 1回目: 成功
    await pressControllerButton('ジャンプ');
    await pressControllerButton('ジャンプ');
    await pressControllerButton('射撃');
    // 2回目: 失敗（射撃から始める）
    await pressControllerButton('射撃');

    fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

    expect(screen.getByTestId('total-attempts').textContent).toContain('2');
    expect(screen.getByTestId('success-count').textContent).toContain('1');
    expect(screen.getByTestId('success-rate').textContent).toContain('50');
  });

  it('練習ログが ct_practice_logs に成功として記録される', async () => {
    render(<PracticeSession command={jumpJumpShotCommand} onExit={() => {}} />);

    await pressControllerButton('ジャンプ');
    await pressControllerButton('ジャンプ');
    await pressControllerButton('射撃');

    const raw = localStorage.getItem('ct_practice_logs');
    expect(raw).not.toBeNull();
    const logs = JSON.parse(raw!) as Record<string, { attempts: { success: boolean }[] }>;
    expect(logs['cmd-jjs']).toBeDefined();
    expect(logs['cmd-jjs'].attempts).toHaveLength(1);
    expect(logs['cmd-jjs'].attempts[0].success).toBe(true);
  });

  it('失敗後も練習ログが ct_practice_logs に記録される', async () => {
    render(<PracticeSession command={jumpJumpShotCommand} onExit={() => {}} />);

    // 射撃で始める（最初のステップは ジャンプ）→ 失敗
    await pressControllerButton('射撃');

    const raw = localStorage.getItem('ct_practice_logs');
    expect(raw).not.toBeNull();
    const logs = JSON.parse(raw!) as Record<string, { attempts: { success: boolean }[] }>;
    expect(logs['cmd-jjs'].attempts[0].success).toBe(false);
  });

  it('「もう一度」でセッションを再開するとカウンタがリセットされ再練習できる', async () => {
    render(<PracticeSession command={jumpJumpShotCommand} onExit={() => {}} />);

    // 1回目成功
    await pressControllerButton('ジャンプ');
    await pressControllerButton('ジャンプ');
    await pressControllerButton('射撃');

    // 終了 → もう一度
    fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));
    fireEvent.click(screen.getByRole('button', { name: /もう一度/ }));

    // セッション再開後、ArcadeController が表示される
    expect(screen.getByTestId('arcade-controller')).toBeTruthy();

    // 再開後のカウンタが 0 からスタートしている
    const counter = screen.getByTestId('attempt-counter');
    expect(counter.textContent).toContain('試行: 0');
  });
});
