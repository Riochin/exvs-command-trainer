import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useControllerInput } from '@/hooks/useControllerInput';
import type React from 'react';

function makePointerEvent(pointerId: number) {
  return { pointerId } as React.PointerEvent<HTMLElement>;
}

describe('useControllerInput', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('初期状態で activeButtons が空のセット', () => {
    const { result } = renderHook(() => useControllerInput());
    expect(result.current.activeButtons.size).toBe(0);
  });

  it('初期状態で onButtonPress が null', () => {
    const { result } = renderHook(() => useControllerInput());
    expect(result.current.onButtonPress).toBeNull();
  });

  describe('getButtonHandlers', () => {
    it('pointerDown で activeButtons にボタンが追加される', () => {
      const { result } = renderHook(() => useControllerInput());
      act(() => {
        result.current.getButtonHandlers('shot').onPointerDown(makePointerEvent(1));
      });
      expect(result.current.activeButtons.has('shot')).toBe(true);
    });

    it('pointerUp で activeButtons からボタンが削除される', () => {
      const { result } = renderHook(() => useControllerInput());
      act(() => {
        result.current.getButtonHandlers('shot').onPointerDown(makePointerEvent(1));
      });
      act(() => {
        result.current.getButtonHandlers('shot').onPointerUp(makePointerEvent(1));
      });
      expect(result.current.activeButtons.has('shot')).toBe(false);
    });

    it('pointerCancel で activeButtons からボタンが削除される', () => {
      const { result } = renderHook(() => useControllerInput());
      act(() => {
        result.current.getButtonHandlers('melee').onPointerDown(makePointerEvent(2));
      });
      act(() => {
        result.current.getButtonHandlers('melee').onPointerCancel(makePointerEvent(2));
      });
      expect(result.current.activeButtons.has('melee')).toBe(false);
    });

    it('2本指で別々のボタンを同時タッチすると activeButtons に両方が含まれる', () => {
      const { result } = renderHook(() => useControllerInput());
      act(() => {
        result.current.getButtonHandlers('shot').onPointerDown(makePointerEvent(1));
        result.current.getButtonHandlers('jump').onPointerDown(makePointerEvent(2));
      });
      expect(result.current.activeButtons.has('shot')).toBe(true);
      expect(result.current.activeButtons.has('jump')).toBe(true);
    });

    it('一方の指を離しても他のボタンは activeButtons に残る', () => {
      const { result } = renderHook(() => useControllerInput());
      act(() => {
        result.current.getButtonHandlers('shot').onPointerDown(makePointerEvent(1));
        result.current.getButtonHandlers('jump').onPointerDown(makePointerEvent(2));
      });
      act(() => {
        result.current.getButtonHandlers('shot').onPointerUp(makePointerEvent(1));
      });
      expect(result.current.activeButtons.has('shot')).toBe(false);
      expect(result.current.activeButtons.has('jump')).toBe(true);
    });

    it('suppressCallbackOnPointerDown 指定時は pointerDown でコールバックが呼ばれない', () => {
      const { result } = renderHook(() => useControllerInput());
      const callback = vi.fn();
      act(() => {
        result.current.setOnButtonPress(callback);
      });
      act(() => {
        result.current
          .getButtonHandlers('jump', { suppressCallbackOnPointerDown: true })
          .onPointerDown(makePointerEvent(1));
      });
      expect(callback).not.toHaveBeenCalled();
      expect(result.current.activeButtons.has('jump')).toBe(true);
    });
  });

  describe('getHeldButtonsSync', () => {
    it('pointerDown 後、同期で押下中ボタン集合が取れる', () => {
      const { result } = renderHook(() => useControllerInput());
      act(() => {
        result.current.getButtonHandlers('shot').onPointerDown(makePointerEvent(1));
      });
      expect(result.current.getHeldButtonsSync().has('shot')).toBe(true);
    });
  });

  describe('setOnButtonPress', () => {
    it('setOnButtonPress でコールバックを登録できる', () => {
      const { result } = renderHook(() => useControllerInput());
      const callback = vi.fn();
      act(() => {
        result.current.setOnButtonPress(callback);
      });
      expect(result.current.onButtonPress).toBe(callback);
    });

    it('setOnButtonPress(null) でコールバックを解除できる', () => {
      const { result } = renderHook(() => useControllerInput());
      const callback = vi.fn();
      act(() => {
        result.current.setOnButtonPress(callback);
        result.current.setOnButtonPress(null);
      });
      expect(result.current.onButtonPress).toBeNull();
    });

    it('コールバックが設定されている場合 pointerDown で呼び出される', () => {
      const { result } = renderHook(() => useControllerInput());
      const callback = vi.fn();
      act(() => {
        result.current.setOnButtonPress(callback);
      });
      act(() => {
        result.current.getButtonHandlers('awaken').onPointerDown(makePointerEvent(1));
      });
      expect(callback).toHaveBeenCalledWith('awaken');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('コールバックが null のとき pointerDown でも呼ばれない', () => {
      const { result } = renderHook(() => useControllerInput());
      const callback = vi.fn();
      // register then unregister
      act(() => {
        result.current.setOnButtonPress(callback);
        result.current.setOnButtonPress(null);
      });
      act(() => {
        result.current.getButtonHandlers('shot').onPointerDown(makePointerEvent(1));
      });
      expect(callback).not.toHaveBeenCalled();
    });

    it('コールバックは pointerUp では呼ばれない', () => {
      const { result } = renderHook(() => useControllerInput());
      const callback = vi.fn();
      act(() => {
        result.current.setOnButtonPress(callback);
        result.current.getButtonHandlers('shot').onPointerDown(makePointerEvent(1));
      });
      callback.mockClear();
      act(() => {
        result.current.getButtonHandlers('shot').onPointerUp(makePointerEvent(1));
      });
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
