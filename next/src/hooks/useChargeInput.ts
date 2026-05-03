'use client';

import { useState, useRef, useCallback } from 'react';
import type React from 'react';
import type { ButtonType } from '@/types';
import type { PointerHandlers } from '@/hooks/useControllerInput';

export const CHARGE_THRESHOLD_MS = 300;

export type ChargeableButton = 'melee' | 'shot';

const CHARGE_TYPE_MAP: Record<ChargeableButton, { tap: ButtonType; charge: ButtonType }> = {
  melee: { tap: 'melee', charge: 'melee-charge' },
  shot: { tap: 'shot', charge: 'shot-charge' },
};

export interface UseChargeInputReturn {
  activeChargeButtons: ReadonlySet<ChargeableButton>;
  getChargeHandlers(button: ChargeableButton): PointerHandlers;
  setOnInput(callback: ((button: ButtonType) => void) | null): void;
}

export function useChargeInput(): UseChargeInputReturn {
  const [activeChargeButtons, setActiveChargeButtons] = useState<Set<ChargeableButton>>(new Set());
  const callbackRef = useRef<((button: ButtonType) => void) | null>(null);
  const pointerMapRef = useRef<Map<number, ChargeableButton>>(new Map());
  const holdStartTimesRef = useRef<Map<number, number>>(new Map());

  const setOnInput = useCallback((callback: ((button: ButtonType) => void) | null) => {
    callbackRef.current = callback;
  }, []);

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
        const types = CHARGE_TYPE_MAP[pressedButton];
        callbackRef.current?.(duration > CHARGE_THRESHOLD_MS ? types.charge : types.tap);
      },
      onPointerCancel(event: React.PointerEvent<HTMLElement>) {
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
    [],
  );

  return { activeChargeButtons, getChargeHandlers, setOnInput };
}
