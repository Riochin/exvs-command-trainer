import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendRaw = vi.fn();
const sendButton = vi.fn();
const useRelaySender = vi.fn();

vi.mock('@/features/input-relay/useRelaySender', () => ({
  useRelaySender: (room: string | null) => useRelaySender(room),
}));

import { FreePlayForm } from '@/features/command-editor/FreePlayForm';
import { flushChargeDeferredInput } from '@/__tests__/utils/flushChargeDeferredInput';

describe('FreePlayForm 入力リレー', () => {
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

  it('onRelayRoomChange がなければ PC連携の入口を出さず、生入力も送らない', async () => {
    render(<FreePlayForm />);
    expect(useRelaySender).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('relay-status')).toBeNull();

    const shot = screen.getByRole('button', { name: '射撃' });
    fireEvent.pointerDown(shot, { pointerId: 1 });
    fireEvent.pointerUp(shot, { pointerId: 1 });
    await flushChargeDeferredInput();
    expect(sendRaw).not.toHaveBeenCalled();
  });

  it('relayRoom があれば接続状態を出し、生入力と解釈済み入力を送る', async () => {
    render(<FreePlayForm relayRoom="ABCD" onRelayRoomChange={vi.fn()} />);
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
    expect(screen.getAllByTestId('sequence-step')).toHaveLength(1);
  });
});
