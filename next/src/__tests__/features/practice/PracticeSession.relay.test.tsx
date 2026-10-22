import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const sendRaw = vi.fn();
const sendButton = vi.fn();
const useRelaySender = vi.fn();

vi.mock('@/features/input-relay/useRelaySender', () => ({
  useRelaySender: (room: string | null) => useRelaySender(room),
}));

import { PracticeSession } from '@/features/practice/PracticeSession';
import { flushChargeDeferredInput } from '@/__tests__/utils/flushChargeDeferredInput';
import type { Command } from '@/types';

const command: Command = {
  id: 'cmd-shot',
  mobileSuit: 'テスト機',
  name: '射撃',
  sequence: [{ buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('PracticeSession 入力リレー', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRelaySender.mockImplementation((room: string | null) => ({
      enabled: room !== null,
      connection: room === null ? 'idle' : 'connected',
      error: null,
      sendRaw,
      sendButton,
    }));
  });

  it('onRelayRoomChange がなければ PC連携の入口を出さず、何も送らない', async () => {
    render(<PracticeSession command={command} onExit={vi.fn()} />);
    expect(useRelaySender).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('relay-status')).toBeNull();

    const shot = screen.getByRole('button', { name: '射撃' });
    fireEvent.pointerDown(shot, { pointerId: 1 });
    fireEvent.pointerUp(shot, { pointerId: 1 });
    await flushChargeDeferredInput();
    expect(sendRaw).not.toHaveBeenCalled();
  });

  it('relayRoom があれば接続状態を出し、生入力と解釈済み入力を送る', async () => {
    render(<PracticeSession command={command} onExit={vi.fn()} relayRoom="ABCD" onRelayRoomChange={vi.fn()} />);
    expect(useRelaySender).toHaveBeenCalledWith('ABCD');
    expect(screen.getByTestId('relay-status').textContent).toBe('PC 接続済');

    const shot = screen.getByRole('button', { name: '射撃' });
    fireEvent.pointerDown(shot, { pointerId: 1 });
    fireEvent.pointerUp(shot, { pointerId: 1 });
    await flushChargeDeferredInput();

    expect(sendRaw.mock.calls.map(([raw]) => raw)).toEqual([
      { button: 'shot', phase: 'down' },
      { button: 'shot', phase: 'up' },
    ]);
    expect(sendButton).toHaveBeenCalledWith('shot');
    expect(screen.getByTestId('result-success')).toBeTruthy();
  });
});
