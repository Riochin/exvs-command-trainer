'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import type { ButtonType } from '@/types';
import type { PointerHandlers } from '@/hooks/useControllerInput';

export const CHARGE_THRESHOLD_MS = 300;

export type ChargeableButton = 'melee' | 'shot';

const CHARGE_TYPE_MAP: Record<ChargeableButton, { tap: ButtonType; charge: ButtonType }> = {
  melee: { tap: 'melee', charge: 'melee-charge' },
  shot: { tap: 'shot', charge: 'shot-charge' },
};

type DeferredSoloEmit = {
  timer: ReturnType<typeof setTimeout>;
  source: ChargeableButton;
  output: ButtonType;
};

export type UseChargeInputOptions = {
  /** >0 のとき tap/charge コールバックを離し後に遅延（同時押しの相手が間に合うとキャンセル可能） */
  deferSoloEmitMs?: number;
};

export interface UseChargeInputReturn {
  activeChargeButtons: ReadonlySet<ChargeableButton>;
  getChargeHandlers(button: ChargeableButton): PointerHandlers;
  /** pointerMapRef と同期した現在押下中のチャージ対象ボタン（同時押し判定用） */
  getHeldChargeableSync(): ReadonlySet<ChargeableButton>;
  /** サブ・特射・特格など合成入力後に tap/charge コールバックを出さないポインターをマークする */
  suppressChainedOutputForChargeableButton(button: ChargeableButton): void;
  setOnInput(callback: ((button: ButtonType) => void) | null): void;
  /**
   * いま押された物理ボタンに合わせ、遅延中の単独 tap/charge をキャンセルする。
   * shot 押下 → 直前に離した格闘の遅延発火を捨てる（サブ用）
   * melee 押下 → 射撃側の遅延を捨てる
   * jump 押下 → 射撃・格闘の遅延を両方捨てる（特射・特格用）
   */
  cancelDeferredSoloEmitForChordPartner(physicalDown: 'shot' | 'melee' | 'jump'): void;
  /** 遅延中の tap/charge をすべてキャンセル（複合同時押し成立時など） */
  cancelAllDeferredSoloEmits(): void;
}

export function useChargeInput(options?: UseChargeInputOptions): UseChargeInputReturn {
  const deferMs = options?.deferSoloEmitMs ?? 0;
  const [activeChargeButtons, setActiveChargeButtons] = useState<Set<ChargeableButton>>(new Set());
  const callbackRef = useRef<((button: ButtonType) => void) | null>(null);
  const pointerMapRef = useRef<Map<number, ChargeableButton>>(new Map());
  const holdStartTimesRef = useRef<Map<number, number>>(new Map());
  const suppressedPointerIdsRef = useRef<Set<number>>(new Set());
  const deferredSoloEmitsRef = useRef<Map<number, DeferredSoloEmit>>(new Map());

  const setOnInput = useCallback((callback: ((button: ButtonType) => void) | null) => {
    callbackRef.current = callback;
  }, []);

  const getHeldChargeableSync = useCallback(() => new Set(pointerMapRef.current.values()), []);

  const suppressChainedOutputForChargeableButton = useCallback((button: ChargeableButton) => {
    for (const [pointerId, b] of pointerMapRef.current) {
      if (b === button) suppressedPointerIdsRef.current.add(pointerId);
    }
  }, []);

  const cancelAllDeferredSoloEmits = useCallback(() => {
    for (const { timer } of deferredSoloEmitsRef.current.values()) {
      clearTimeout(timer);
    }
    deferredSoloEmitsRef.current.clear();
  }, []);

  const cancelDeferredSoloEmitForChordPartner = useCallback((physicalDown: 'shot' | 'melee' | 'jump') => {
    const cancelIfSource = (source: ChargeableButton) => {
      for (const [pointerId, meta] of [...deferredSoloEmitsRef.current.entries()]) {
        if (meta.source === source) {
          clearTimeout(meta.timer);
          deferredSoloEmitsRef.current.delete(pointerId);
        }
      }
    };
    if (physicalDown === 'shot') cancelIfSource('melee');
    else if (physicalDown === 'melee') cancelIfSource('shot');
    else {
      cancelIfSource('shot');
      cancelIfSource('melee');
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelAllDeferredSoloEmits();
    };
  }, [cancelAllDeferredSoloEmits]);

  const getChargeHandlers = useCallback(
    (button: ChargeableButton): PointerHandlers => ({
      onPointerDown(event: React.PointerEvent<HTMLElement>) {
        pointerMapRef.current.set(event.pointerId, button);
        holdStartTimesRef.current.set(event.pointerId, Date.now());
        setActiveChargeButtons((prev) => {
          const next = new Set(prev);
          next.add(button);
          return next;
        });
      },
      onPointerUp(event: React.PointerEvent<HTMLElement>) {
        const pressedButton = pointerMapRef.current.get(event.pointerId);
        if (pressedButton === undefined) return;
        const suppressCallback = suppressedPointerIdsRef.current.delete(event.pointerId);
        const startTime = holdStartTimesRef.current.get(event.pointerId);
        const duration = startTime !== undefined ? Date.now() - startTime : 0;
        pointerMapRef.current.delete(event.pointerId);
        holdStartTimesRef.current.delete(event.pointerId);
        setActiveChargeButtons((prev) => {
          const next = new Set(prev);
          const stillHeld = Array.from(pointerMapRef.current.values()).includes(pressedButton);
          if (!stillHeld) next.delete(pressedButton);
          return next;
        });
        if (suppressCallback) return;
        const types = CHARGE_TYPE_MAP[pressedButton];
        const outputType = duration > CHARGE_THRESHOLD_MS ? types.charge : types.tap;
        if (deferMs <= 0) {
          callbackRef.current?.(outputType);
          return;
        }
        const scheduleId = event.pointerId;
        const timer = setTimeout(() => {
          deferredSoloEmitsRef.current.delete(scheduleId);
          callbackRef.current?.(outputType);
        }, deferMs);
        deferredSoloEmitsRef.current.set(scheduleId, { timer, source: pressedButton, output: outputType });
      },
      onPointerCancel(event: React.PointerEvent<HTMLElement>) {
        const pid = event.pointerId;
        const pending = deferredSoloEmitsRef.current.get(pid);
        if (pending) {
          clearTimeout(pending.timer);
          deferredSoloEmitsRef.current.delete(pid);
        }
        const pressedButton = pointerMapRef.current.get(event.pointerId);
        if (pressedButton === undefined) return;
        pointerMapRef.current.delete(event.pointerId);
        holdStartTimesRef.current.delete(event.pointerId);
        setActiveChargeButtons((prev) => {
          const next = new Set(prev);
          const stillHeld = Array.from(pointerMapRef.current.values()).includes(pressedButton);
          if (!stillHeld) next.delete(pressedButton);
          return next;
        });
      },
    }),
    [deferMs],
  );

  return {
    activeChargeButtons,
    getChargeHandlers,
    getHeldChargeableSync,
    suppressChainedOutputForChargeableButton,
    setOnInput,
    cancelDeferredSoloEmitForChordPartner,
    cancelAllDeferredSoloEmits,
  };
}
