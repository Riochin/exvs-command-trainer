import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLandscapeMode } from '@/hooks/useLandscapeMode';

type ChangeListener = (e: { matches: boolean }) => void;

function makeMockMQ(matches: boolean) {
  const listeners: ChangeListener[] = [];
  return {
    matches,
    addEventListener: vi.fn((_type: string, fn: ChangeListener) => listeners.push(fn)),
    removeEventListener: vi.fn(),
    _trigger(newMatches: boolean) {
      listeners.forEach((fn) => fn({ matches: newMatches }));
    },
  };
}

describe('useLandscapeMode', () => {
  let mockMQ: ReturnType<typeof makeMockMQ>;

  beforeEach(() => {
    mockMQ = makeMockMQ(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMQ as unknown as MediaQueryList);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('マウント後 isLandscape が matchMedia の値を反映する（横画面）', () => {
    mockMQ.matches = true;
    const { result } = renderHook(() => useLandscapeMode());
    expect(result.current.isLandscape).toBe(true);
  });

  it('マウント後 isLandscape が matchMedia の値を反映する（縦画面）', () => {
    mockMQ = makeMockMQ(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMQ as unknown as MediaQueryList);
    const { result } = renderHook(() => useLandscapeMode());
    expect(result.current.isLandscape).toBe(false);
  });

  it('orientation: landscape のメディアクエリで matchMedia が呼ばれる', () => {
    renderHook(() => useLandscapeMode());
    expect(window.matchMedia).toHaveBeenCalledWith('(orientation: landscape)');
  });

  it('向きが横→縦に変わると isLandscape がリアクティブに false になる', () => {
    mockMQ.matches = true;
    const { result } = renderHook(() => useLandscapeMode());
    expect(result.current.isLandscape).toBe(true);

    act(() => {
      mockMQ._trigger(false);
    });
    expect(result.current.isLandscape).toBe(false);
  });

  it('向きが縦→横に変わると isLandscape がリアクティブに true になる', () => {
    mockMQ = makeMockMQ(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMQ as unknown as MediaQueryList);
    const { result } = renderHook(() => useLandscapeMode());
    expect(result.current.isLandscape).toBe(false);

    act(() => {
      mockMQ._trigger(true);
    });
    expect(result.current.isLandscape).toBe(true);
  });

  it('アンマウント時に matchMedia のリスナーが解除される', () => {
    const { unmount } = renderHook(() => useLandscapeMode());
    unmount();
    expect(mockMQ.removeEventListener).toHaveBeenCalled();
  });
});
