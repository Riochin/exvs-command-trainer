'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import type { ButtonType } from '@/types';
import type { PointerHandlers } from '@/hooks/useControllerInput';

export const CHARGE_THRESHOLD_MS = 300;

export type ChargeableButton = 'melee' | 'shot';

const CHARGE_TYPE_MAP: Record<ChargeableButton, { tap: ButtonType; chargeStart: ButtonType; chargeEnd: ButtonType }> = {
  melee: { tap: 'melee', chargeStart: 'melee-charge-start', chargeEnd: 'melee-charge-end' },
  shot: { tap: 'shot', chargeStart: 'shot-charge-start', chargeEnd: 'shot-charge-end' },
};

type DeferredSoloEmit = {
  timer: ReturnType<typeof setTimeout>;
  source: ChargeableButton;
  output: ButtonType;
};

export type UseChargeInputOptions = {
  /** >0 のとき tap コールバックを離し後に遅延（同時押しの相手が間に合うとキャンセル可能） */
  deferSoloEmitMs?: number;
};

export interface UseChargeInputReturn {
  activeChargeButtons: ReadonlySet<ChargeableButton>;
  /** 300ms以上のホールドが確定したボタン（チャージ開始済み）。コード検出の抑制に使う */
  chargingButtons: ReadonlySet<ChargeableButton>;
  getChargeHandlers(button: ChargeableButton): PointerHandlers;
  /** pointerMapRef と同期した現在押下中のチャージ対象ボタン（同時押し判定用） */
  getHeldChargeableSync(): ReadonlySet<ChargeableButton>;
  /** chargingButtonsRef と同期したチャージ確定済みボタン（コード検出の同期ガード用） */
  getChargingSync(): ReadonlySet<ChargeableButton>;
  /** サブ・特射・特格など合成入力後に tap コールバックを出さないポインターをマークする */
  suppressChainedOutputForChargeableButton(button: ChargeableButton): void;
  setOnInput(callback: ((button: ButtonType) => void) | null): void;
  /**
   * いま押された物理ボタンに合わせ、遅延中の単独 tap をキャンセルする。
   * shot 押下 → 直前に離した格闘の遅延発火を捨てる（サブ用）
   * melee 押下 → 射撃側の遅延を捨てる
   * jump 押下 → 射撃・格闘の遅延を両方捨てる（特射・特格用）
   */
  cancelDeferredSoloEmitForChordPartner(physicalDown: 'shot' | 'melee' | 'jump'): void;
  /** 遅延中の tap をすべてキャンセル（複合同時押し成立時など） */
  cancelAllDeferredSoloEmits(): void;
}

export function useChargeInput(options?: UseChargeInputOptions): UseChargeInputReturn {
  const deferMs = options?.deferSoloEmitMs ?? 0;
  const [activeChargeButtons, setActiveChargeButtons] = useState<Set<ChargeableButton>>(new Set());
  const [chargingButtons, setChargingButtons] = useState<Set<ChargeableButton>>(new Set());
  const callbackRef = useRef<((button: ButtonType) => void) | null>(null);
  const pointerMapRef = useRef<Map<number, ChargeableButton>>(new Map());
  const holdStartTimesRef = useRef<Map<number, number>>(new Map());
  const suppressedPointerIdsRef = useRef<Set<number>>(new Set());
  const deferredSoloEmitsRef = useRef<Map<number, DeferredSoloEmit>>(new Map());
  // 300msタイマー管理: タイマーが残っている = タップ中、消えている = チャージ確定済み
  const chargeStartTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // 同期的にチャージ状態を参照するためのRef（State更新の非同期性を回避）
  const chargingButtonsRef = useRef<Set<ChargeableButton>>(new Set());

  const setOnInput = useCallback((callback: ((button: ButtonType) => void) | null) => {
    callbackRef.current = callback;
  }, []);

  const getHeldChargeableSync = useCallback(() => new Set(pointerMapRef.current.values()), []);

  const getChargingSync = useCallback(() => new Set(chargingButtonsRef.current), []);

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
      for (const timer of chargeStartTimersRef.current.values()) {
        clearTimeout(timer);
      }
      chargeStartTimersRef.current.clear();
    };
  }, [cancelAllDeferredSoloEmits]);

  const getChargeHandlers = useCallback(
    (button: ChargeableButton): PointerHandlers => ({
      onPointerDown(event: React.PointerEvent<HTMLElement>) {
        const pointerId = event.pointerId;
        pointerMapRef.current.set(pointerId, button);
        holdStartTimesRef.current.set(pointerId, Date.now());
        setActiveChargeButtons((prev) => {
          const next = new Set(prev);
          next.add(button);
          return next;
        });

        // 300ms後に charge-start を発火するタイマーをセット
        const timer = setTimeout(() => {
          chargeStartTimersRef.current.delete(pointerId);
          if (!pointerMapRef.current.has(pointerId)) return;
          chargingButtonsRef.current.add(button);
          setChargingButtons((prev) => {
            const next = new Set(prev);
            next.add(button);
            return next;
          });
          callbackRef.current?.(CHARGE_TYPE_MAP[button].chargeStart);
        }, CHARGE_THRESHOLD_MS);
        chargeStartTimersRef.current.set(pointerId, timer);
      },

      onPointerUp(event: React.PointerEvent<HTMLElement>) {
        const pointerId = event.pointerId;
        const pressedButton = pointerMapRef.current.get(pointerId);
        if (pressedButton === undefined) return;
        const suppressCallback = suppressedPointerIdsRef.current.delete(pointerId);

        // タイマーが残っている = タップ（チャージ未確定）、消えている = チャージ確定済み
        const pendingChargeTimer = chargeStartTimersRef.current.get(pointerId);
        const wasCharging = pendingChargeTimer === undefined;

        if (pendingChargeTimer !== undefined) {
          clearTimeout(pendingChargeTimer);
          chargeStartTimersRef.current.delete(pointerId);
        }

        pointerMapRef.current.delete(pointerId);
        holdStartTimesRef.current.delete(pointerId);

        setActiveChargeButtons((prev) => {
          const next = new Set(prev);
          const stillHeld = Array.from(pointerMapRef.current.values()).includes(pressedButton);
          if (!stillHeld) next.delete(pressedButton);
          return next;
        });

        if (wasCharging) {
          const stillHeldByOtherPointer = Array.from(pointerMapRef.current.values()).includes(pressedButton);
          if (!stillHeldByOtherPointer) {
            chargingButtonsRef.current.delete(pressedButton);
            setChargingButtons((prev) => {
              const next = new Set(prev);
              next.delete(pressedButton);
              return next;
            });
          }
        }

        if (suppressCallback) return;

        if (wasCharging) {
          // チャージ終わりを即時発火（チャージ中はコード検出が無効なため defer 不要）
          callbackRef.current?.(CHARGE_TYPE_MAP[pressedButton].chargeEnd);
          return;
        }

        // タップ: 同時押し検出のために遅延発火
        const outputType = CHARGE_TYPE_MAP[pressedButton].tap;
        if (deferMs <= 0) {
          callbackRef.current?.(outputType);
          return;
        }
        const scheduleId = pointerId;
        const tapTimer = setTimeout(() => {
          deferredSoloEmitsRef.current.delete(scheduleId);
          callbackRef.current?.(outputType);
        }, deferMs);
        deferredSoloEmitsRef.current.set(scheduleId, { timer: tapTimer, source: pressedButton, output: outputType });
      },

      onPointerCancel(event: React.PointerEvent<HTMLElement>) {
        const pointerId = event.pointerId;

        const chargeTimer = chargeStartTimersRef.current.get(pointerId);
        if (chargeTimer !== undefined) {
          clearTimeout(chargeTimer);
          chargeStartTimersRef.current.delete(pointerId);
        }

        const pending = deferredSoloEmitsRef.current.get(pointerId);
        if (pending) {
          clearTimeout(pending.timer);
          deferredSoloEmitsRef.current.delete(pointerId);
        }

        const pressedButton = pointerMapRef.current.get(pointerId);
        if (pressedButton === undefined) return;
        pointerMapRef.current.delete(pointerId);
        holdStartTimesRef.current.delete(pointerId);

        setActiveChargeButtons((prev) => {
          const next = new Set(prev);
          const stillHeld = Array.from(pointerMapRef.current.values()).includes(pressedButton);
          if (!stillHeld) next.delete(pressedButton);
          return next;
        });

        if (chargingButtonsRef.current.has(pressedButton)) {
          const stillHeld = Array.from(pointerMapRef.current.values()).includes(pressedButton);
          if (!stillHeld) {
            chargingButtonsRef.current.delete(pressedButton);
            setChargingButtons((prev) => {
              const next = new Set(prev);
              next.delete(pressedButton);
              return next;
            });
          }
        }
      },
    }),
    [deferMs],
  );

  return {
    activeChargeButtons,
    chargingButtons,
    getChargeHandlers,
    getHeldChargeableSync,
    getChargingSync,
    suppressChainedOutputForChargeableButton,
    setOnInput,
    cancelDeferredSoloEmitForChordPartner,
    cancelAllDeferredSoloEmits,
  };
}
