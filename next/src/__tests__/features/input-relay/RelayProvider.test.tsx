import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pathname = vi.fn().mockReturnValue('/');
vi.mock('next/navigation', () => ({ usePathname: () => pathname() }));

const useRelaySender = vi.fn();
vi.mock('@/features/input-relay/useRelaySender', () => ({
  useRelaySender: (room: string | null) => useRelaySender(room),
}));

import { RelayProvider, useRelay } from '@/features/input-relay/RelayProvider';
import { getRelayRoom, resetRelayRoomStore, setRelayRoom } from '@/features/input-relay/relayRoomStore';

function Probe() {
  const relay = useRelay();
  return <div data-testid="room">{relay?.room ?? 'none'}</div>;
}

describe('RelayProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    resetRelayRoomStore();
    pathname.mockReturnValue('/practice');
    useRelaySender.mockImplementation(() => ({ connection: 'idle', error: null, sendRaw: vi.fn(), sendButton: vi.fn() }));
    window.history.replaceState(null, '', '/practice');
  });

  it('URL の ?relay= を読み取ってつなぎ、URL からは消す', () => {
    window.history.replaceState(null, '', '/practice?relay=abcd&x=1');
    render(
      <RelayProvider>
        <Probe />
      </RelayProvider>,
    );
    expect(screen.getByTestId('room').textContent).toBe('ABCD');
    expect(useRelaySender).toHaveBeenLastCalledWith('ABCD');
    expect(window.location.search).toBe('?x=1');
    expect(window.sessionStorage.getItem('input-relay:room')).toBe('ABCD');
  });

  it('ページを移っても（再読み込みしても）保存したルームにつなぎ直す', () => {
    window.sessionStorage.setItem('input-relay:room', 'WXYZ');
    render(
      <RelayProvider>
        <Probe />
      </RelayProvider>,
    );
    expect(screen.getByTestId('room').textContent).toBe('WXYZ');
  });

  it('切断すると保存も消える', () => {
    render(
      <RelayProvider>
        <Probe />
      </RelayProvider>,
    );
    act(() => setRelayRoom('ABCD'));
    expect(screen.getByTestId('room').textContent).toBe('ABCD');
    act(() => setRelayRoom(null));
    expect(screen.getByTestId('room').textContent).toBe('none');
    expect(getRelayRoom()).toBeNull();
    expect(window.sessionStorage.getItem('input-relay:room')).toBeNull();
  });

  it.each(['/', '/3d', '/tools/chart-author'])('PC 側の画面（%s）では、スマホとしてはつながない', (path) => {
    window.sessionStorage.setItem('input-relay:room', 'WXYZ');
    pathname.mockReturnValue(path);
    render(
      <RelayProvider>
        <Probe />
      </RelayProvider>,
    );
    expect(useRelaySender).toHaveBeenLastCalledWith(null);
  });

  it('不正なコードは無視する', () => {
    window.history.replaceState(null, '', '/practice?relay=a1');
    render(
      <RelayProvider>
        <Probe />
      </RelayProvider>,
    );
    expect(screen.getByTestId('room').textContent).toBe('none');
  });
});
