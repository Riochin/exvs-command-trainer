import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChargeInput, CHARGE_THRESHOLD_MS } from '@/hooks/useChargeInput';
import type React from 'react';

function makePointerEvent(pointerId: number) {
  return { pointerId } as React.PointerEvent<HTMLElement>;
}

describe('useChargeInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('activeChargeButtons 初期状態', () => {
    it('初期状態で空のセット', () => {
      const { result } = renderHook(() => useChargeInput());
      expect(result.current.activeChargeButtons.size).toBe(0);
    });

    it('pointerDown で activeChargeButtons にボタンが追加される', () => {
      const { result } = renderHook(() => useChargeInput());
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
      });
      expect(result.current.activeChargeButtons.has('melee')).toBe(true);
    });

    it('pointerUp 後に activeChargeButtons からボタンが削除される', () => {
      const { result } = renderHook(() => useChargeInput());
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
      });
      act(() => {
        result.current.getChargeHandlers('melee').onPointerUp(makePointerEvent(1));
      });
      expect(result.current.activeChargeButtons.has('melee')).toBe(false);
    });
  });

  describe('melee ボタン tap / charge 判定', () => {
    it('短押し（100ms）で melee コールバックが呼ばれる', () => {
      const { result } = renderHook(() => useChargeInput());
      const callback = vi.fn();
      act(() => { result.current.setOnInput(callback); });

      const startTime = Date.now();
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
      });
      vi.setSystemTime(startTime + 100);
      act(() => {
        result.current.getChargeHandlers('melee').onPointerUp(makePointerEvent(1));
      });

      expect(callback).toHaveBeenCalledWith('melee');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('長押し（400ms）で melee-charge コールバックが呼ばれる', () => {
      const { result } = renderHook(() => useChargeInput());
      const callback = vi.fn();
      act(() => { result.current.setOnInput(callback); });

      const startTime = Date.now();
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
      });
      vi.setSystemTime(startTime + 400);
      act(() => {
        result.current.getChargeHandlers('melee').onPointerUp(makePointerEvent(1));
      });

      expect(callback).toHaveBeenCalledWith('melee-charge');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it(`しきい値境界（${CHARGE_THRESHOLD_MS}ms）はタップ扱いで melee が呼ばれる`, () => {
      const { result } = renderHook(() => useChargeInput());
      const callback = vi.fn();
      act(() => { result.current.setOnInput(callback); });

      const startTime = Date.now();
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
      });
      vi.setSystemTime(startTime + CHARGE_THRESHOLD_MS);
      act(() => {
        result.current.getChargeHandlers('melee').onPointerUp(makePointerEvent(1));
      });

      expect(callback).toHaveBeenCalledWith('melee');
    });
  });

  describe('shot ボタン tap / charge 判定', () => {
    it('短押しで shot コールバックが呼ばれる', () => {
      const { result } = renderHook(() => useChargeInput());
      const callback = vi.fn();
      act(() => { result.current.setOnInput(callback); });

      const startTime = Date.now();
      act(() => {
        result.current.getChargeHandlers('shot').onPointerDown(makePointerEvent(2));
      });
      vi.setSystemTime(startTime + 100);
      act(() => {
        result.current.getChargeHandlers('shot').onPointerUp(makePointerEvent(2));
      });

      expect(callback).toHaveBeenCalledWith('shot');
    });

    it('長押しで shot-charge コールバックが呼ばれる', () => {
      const { result } = renderHook(() => useChargeInput());
      const callback = vi.fn();
      act(() => { result.current.setOnInput(callback); });

      const startTime = Date.now();
      act(() => {
        result.current.getChargeHandlers('shot').onPointerDown(makePointerEvent(2));
      });
      vi.setSystemTime(startTime + 400);
      act(() => {
        result.current.getChargeHandlers('shot').onPointerUp(makePointerEvent(2));
      });

      expect(callback).toHaveBeenCalledWith('shot-charge');
    });
  });

  describe('pointerCancel', () => {
    it('pointerCancel ではコールバックが呼ばれない', () => {
      const { result } = renderHook(() => useChargeInput());
      const callback = vi.fn();
      act(() => { result.current.setOnInput(callback); });

      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
        result.current.getChargeHandlers('melee').onPointerCancel(makePointerEvent(1));
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('pointerCancel 後 activeChargeButtons から削除される', () => {
      const { result } = renderHook(() => useChargeInput());
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
      });
      expect(result.current.activeChargeButtons.has('melee')).toBe(true);
      act(() => {
        result.current.getChargeHandlers('melee').onPointerCancel(makePointerEvent(1));
      });
      expect(result.current.activeChargeButtons.has('melee')).toBe(false);
    });
  });

  describe('setOnInput', () => {
    it('setOnInput(null) のとき pointerUp 後もコールバックが呼ばれない', () => {
      const { result } = renderHook(() => useChargeInput());
      const callback = vi.fn();
      act(() => {
        result.current.setOnInput(callback);
        result.current.setOnInput(null);
      });

      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
        result.current.getChargeHandlers('melee').onPointerUp(makePointerEvent(1));
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('マルチタッチ', () => {
    it('melee と shot を同時に保持できる', () => {
      const { result } = renderHook(() => useChargeInput());
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
        result.current.getChargeHandlers('shot').onPointerDown(makePointerEvent(2));
      });
      expect(result.current.activeChargeButtons.has('melee')).toBe(true);
      expect(result.current.activeChargeButtons.has('shot')).toBe(true);
    });

    it('2ポインターが独立して tap/charge 判定される', () => {
      const { result } = renderHook(() => useChargeInput());
      const callback = vi.fn();
      act(() => { result.current.setOnInput(callback); });

      const startTime = Date.now();
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
        result.current.getChargeHandlers('shot').onPointerDown(makePointerEvent(2));
      });

      vi.setSystemTime(startTime + 100);
      act(() => {
        result.current.getChargeHandlers('melee').onPointerUp(makePointerEvent(1));
      });

      vi.setSystemTime(startTime + 400);
      act(() => {
        result.current.getChargeHandlers('shot').onPointerUp(makePointerEvent(2));
      });

      expect(callback).toHaveBeenNthCalledWith(1, 'melee');
      expect(callback).toHaveBeenNthCalledWith(2, 'shot-charge');
    });

    it('一方を離しても他方は activeChargeButtons に残る', () => {
      const { result } = renderHook(() => useChargeInput());
      act(() => {
        result.current.getChargeHandlers('melee').onPointerDown(makePointerEvent(1));
        result.current.getChargeHandlers('shot').onPointerDown(makePointerEvent(2));
      });
      act(() => {
        result.current.getChargeHandlers('melee').onPointerUp(makePointerEvent(1));
      });
      expect(result.current.activeChargeButtons.has('melee')).toBe(false);
      expect(result.current.activeChargeButtons.has('shot')).toBe(true);
    });
  });
});
