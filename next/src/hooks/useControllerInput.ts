'use client';

import { useState, useCallback, useRef } from 'react';
import type React from 'react';
import type { ButtonType } from '@/types';

export type PointerHandlers = {
  onPointerDown(event: React.PointerEvent<HTMLElement>): void;
  onPointerUp(event: React.PointerEvent<HTMLElement>): void;
  onPointerCancel(event: React.PointerEvent<HTMLElement>): void;
};

export type GetButtonHandlersOptions = {
  /** 同時押し合成などで pointerDown 時の即時コールバックを抑止する */
  suppressCallbackOnPointerDown?: boolean;
};

export interface UseControllerInputReturn {
  activeButtons: ReadonlySet<ButtonType>;
  getButtonHandlers(button: ButtonType, options?: GetButtonHandlersOptions): PointerHandlers;
  /** pointerMapRef と同期した現在押下中のボタン（同時押し判定用） */
  getHeldButtonsSync(): ReadonlySet<ButtonType>;
  onButtonPress: ((button: ButtonType) => void) | null;
  setOnButtonPress(callback: ((button: ButtonType) => void) | null): void;
}

export function useControllerInput(): UseControllerInputReturn {
  const [activeButtons, setActiveButtons] = useState<Set<ButtonType>>(new Set());
  const [onButtonPress, setOnButtonPressState] = useState<((button: ButtonType) => void) | null>(null);

  // pointerId → button の対応を安定した ref で管理（レンダリングをトリガしない）
  const pointerMapRef = useRef<Map<number, ButtonType>>(new Map());
  // コールバックを ref でも保持し、getButtonHandlers の closure 内から最新値にアクセスする
  const callbackRef = useRef<((button: ButtonType) => void) | null>(null);

  const setOnButtonPress = useCallback((callback: ((button: ButtonType) => void) | null) => {
    callbackRef.current = callback;
    setOnButtonPressState(() => callback);
  }, []);

  const getHeldButtonsSync = useCallback(() => new Set(pointerMapRef.current.values()), []);

  const getButtonHandlers = useCallback(
    (button: ButtonType, options?: GetButtonHandlersOptions): PointerHandlers => ({
      onPointerDown(event: React.PointerEvent<HTMLElement>) {
        pointerMapRef.current.set(event.pointerId, button);
        setActiveButtons((prev) => {
          const next = new Set(prev);
          next.add(button);
          return next;
        });
        if (!options?.suppressCallbackOnPointerDown) {
          callbackRef.current?.(button);
        }
      },
      onPointerUp(event: React.PointerEvent<HTMLElement>) {
        const pressed = pointerMapRef.current.get(event.pointerId);
        if (pressed === undefined) return;
        pointerMapRef.current.delete(event.pointerId);
        setActiveButtons((prev) => {
          const next = new Set(prev);
          const stillHeld = Array.from(pointerMapRef.current.values()).includes(pressed);
          if (!stillHeld) next.delete(pressed);
          return next;
        });
      },
      onPointerCancel(event: React.PointerEvent<HTMLElement>) {
        const pressed = pointerMapRef.current.get(event.pointerId);
        if (pressed === undefined) return;
        pointerMapRef.current.delete(event.pointerId);
        setActiveButtons((prev) => {
          const next = new Set(prev);
          const stillHeld = Array.from(pointerMapRef.current.values()).includes(pressed);
          if (!stillHeld) next.delete(pressed);
          return next;
        });
      },
    }),
    [],
  );

  return { activeButtons, getButtonHandlers, getHeldButtonsSync, onButtonPress, setOnButtonPress };
}
