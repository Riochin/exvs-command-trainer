'use client';

import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { useControllerInput } from '@/hooks/useControllerInput';
import { useChargeInput, type ChargeableButton } from '@/hooks/useChargeInput';
import { ControllerButton } from './ControllerButton';
import type { ButtonType, CommandStep } from '@/types';
import styles from './ArcadeController.module.css';

export type ArcadePhysicalButton = 'shot' | 'melee' | 'jump';

/** 同時押し判定用の短い遅延（ジャンプ単独／射撃・格闘の tap・charge を、相手ボタンが続く場合に誤発火しないため） */
export const SIMULTANEOUS_INPUT_DEFER_MS = 50;

const BUTTONS = ['shot', 'melee', 'jump'] as const satisfies readonly ArcadePhysicalButton[];

/** PC デバッグ用キー（f/y/i）。実ポインターと衝突しない負の ID。 */
const KEYBOARD_DEBUG_POINTER_IDS: Record<ArcadePhysicalButton, number> = {
  shot: -91_001,
  melee: -91_002,
  jump: -91_003,
};

function syntheticKeyboardPointerEvent(pointerId: number): React.PointerEvent<HTMLElement> {
  return { pointerId } as React.PointerEvent<HTMLElement>;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function debugKeyToPhysicalButton(key: string): ArcadePhysicalButton | null {
  if (key.length !== 1) return null;
  switch (key.toLowerCase()) {
    case 'f':
      return 'shot';
    case 'y':
      return 'melee';
    case 'i':
      return 'jump';
    default:
      return null;
  }
}

function isChargeable(button: ButtonType): button is ChargeableButton {
  return button === 'shot' || button === 'melee';
}

function resolveHighlightedPhysical(
  highlightedPhysicalButtons: ReadonlyArray<ArcadePhysicalButton> | null | undefined,
  highlightedButton: ButtonType | null | undefined,
): ArcadePhysicalButton[] {
  if (highlightedPhysicalButtons != null) {
    return [...highlightedPhysicalButtons];
  }
  const b = highlightedButton;
  if (b === 'shot' || b === 'melee' || b === 'jump') {
    return [b];
  }
  return [];
}

export interface ArcadeControllerProps {
  onButtonPress?: (button: ButtonType) => void;
  onStepAdded?: (step: CommandStep) => void;
  highlightedButton?: ButtonType | null;
  /** 練習ヒント用。指定時は highlightedButton より優先（チャージ・複合入力の複数灯） */
  highlightedPhysicalButtons?: ReadonlyArray<ArcadePhysicalButton> | null;
  /** 全ボタンに一括適用する状態フィードバック（success / fail / neutral） */
  buttonStateOverride?: import('./ControllerButton').ControllerButtonState;
}

export function ArcadeController({
  onButtonPress,
  onStepAdded,
  highlightedButton,
  highlightedPhysicalButtons,
  buttonStateOverride,
}: ArcadeControllerProps) {
  const { activeButtons, getButtonHandlers, setOnButtonPress, getHeldButtonsSync } = useControllerInput();
  const {
    activeChargeButtons,
    getChargeHandlers,
    setOnInput,
    getHeldChargeableSync,
    getChargingSync,
    suppressChainedOutputForChargeableButton,
    cancelDeferredSoloEmitForChordPartner,
    cancelAllDeferredSoloEmits,
  } = useChargeInput({ deferSoloEmitMs: SIMULTANEOUS_INPUT_DEFER_MS });

  const inputHandlerRef = useRef<((button: ButtonType) => void) | null>(null);
  const subComboPrevRef = useRef(false);
  const specialShotComboPrevRef = useRef(false);
  const specialMeleeComboPrevRef = useRef(false);
  /** ジャンプ単独の遅延発火（特格/特射の直前ジャンプ誤検知防止） */
  const soloJumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 特射・特格がこのジャンプ押しを消費した — pointerUp で jump を出さない */
  const jumpChordConsumedRef = useRef(false);
  /** 遅延タイマーで既に jump を出したポインター（長押し後の離しで二重にしない） */
  const jumpSoloEmittedPointerIdsRef = useRef<Set<number>>(new Set());

  const clearSoloJumpSchedule = useCallback(() => {
    if (soloJumpTimerRef.current !== null) {
      clearTimeout(soloJumpTimerRef.current);
      soloJumpTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handler =
      onButtonPress ?? (onStepAdded ? (button: ButtonType) => onStepAdded({ buttons: [button] }) : null);
    inputHandlerRef.current = handler;
    setOnButtonPress(handler);
    setOnInput(handler);
  }, [onButtonPress, onStepAdded, setOnButtonPress, setOnInput]);

  useEffect(() => {
    return () => {
      if (soloJumpTimerRef.current) clearTimeout(soloJumpTimerRef.current);
    };
  }, []);

  const syncChordInputs = useCallback(() => {
    const ch = getHeldChargeableSync();
    const ctrl = getHeldButtonsSync();
    const charging = getChargingSync();
    const cb = inputHandlerRef.current;

    // チャージ中のボタンを含むコードは検出しない
    const subCombo = ch.has('shot') && ch.has('melee') && !charging.has('shot') && !charging.has('melee');
    const specialShotCombo = ch.has('shot') && ctrl.has('jump') && !charging.has('shot');
    const specialMeleeCombo = ch.has('melee') && ctrl.has('jump') && !charging.has('melee');

    if (!cb) {
      subComboPrevRef.current = subCombo;
      specialShotComboPrevRef.current = specialShotCombo;
      specialMeleeComboPrevRef.current = specialMeleeCombo;
      return;
    }

    if (subCombo && !subComboPrevRef.current) {
      cancelAllDeferredSoloEmits();
      cb('sub');
      suppressChainedOutputForChargeableButton('shot');
      suppressChainedOutputForChargeableButton('melee');
    }
    subComboPrevRef.current = subCombo;

    if (specialShotCombo && !specialShotComboPrevRef.current) {
      cancelAllDeferredSoloEmits();
      jumpChordConsumedRef.current = true;
      cb('special-shot');
      suppressChainedOutputForChargeableButton('shot');
    }
    specialShotComboPrevRef.current = specialShotCombo;

    if (specialMeleeCombo && !specialMeleeComboPrevRef.current) {
      cancelAllDeferredSoloEmits();
      jumpChordConsumedRef.current = true;
      cb('special-melee');
      suppressChainedOutputForChargeableButton('melee');
    }
    specialMeleeComboPrevRef.current = specialMeleeCombo;
  }, [
    getHeldChargeableSync,
    getHeldButtonsSync,
    getChargingSync,
    suppressChainedOutputForChargeableButton,
    cancelAllDeferredSoloEmits,
  ]);

  const wrapChargeHandlers = useCallback(
    (btn: ChargeableButton) => {
      const inner = getChargeHandlers(btn);
      return {
        onPointerDown(event: Parameters<typeof inner.onPointerDown>[0]) {
          clearSoloJumpSchedule();
          cancelDeferredSoloEmitForChordPartner(btn);
          inner.onPointerDown(event);
          syncChordInputs();
        },
        onPointerUp(event: Parameters<typeof inner.onPointerUp>[0]) {
          inner.onPointerUp(event);
          syncChordInputs();
        },
        onPointerCancel(event: Parameters<typeof inner.onPointerCancel>[0]) {
          inner.onPointerCancel(event);
          syncChordInputs();
        },
      };
    },
    [getChargeHandlers, syncChordInputs, clearSoloJumpSchedule, cancelDeferredSoloEmitForChordPartner],
  );

  const wrapJumpHandlers = useCallback(() => {
    return {
      onPointerDown(event: React.PointerEvent<HTMLElement>) {
        jumpChordConsumedRef.current = false;
        cancelDeferredSoloEmitForChordPartner('jump');
        getButtonHandlers('jump', { suppressCallbackOnPointerDown: true }).onPointerDown(event);
        syncChordInputs();

        const charging = getChargingSync();
        const shotHeld = getHeldChargeableSync().has('shot');
        const meleeHeld = getHeldChargeableSync().has('melee');
        // タップウィンドウ中（チャージ未確定）のボタンと同時押しになりうるときだけ solo timer をスキップ
        const chordPossible = (shotHeld && !charging.has('shot')) || (meleeHeld && !charging.has('melee'));
        if (chordPossible) {
          clearSoloJumpSchedule();
          return;
        }

        clearSoloJumpSchedule();
        const pid = event.pointerId;
        soloJumpTimerRef.current = setTimeout(() => {
          soloJumpTimerRef.current = null;
          const ch = getHeldChargeableSync();
          const currentCharging = getChargingSync();
          const ctrl = getHeldButtonsSync();
          if (!inputHandlerRef.current || !ctrl.has('jump')) return;
          // タップウィンドウ中のボタンがあれば chord を待つ（チャージ中は除く）
          const uncharged = [...ch].filter((b) => !currentCharging.has(b));
          if (uncharged.length > 0) return;
          jumpSoloEmittedPointerIdsRef.current.add(pid);
          inputHandlerRef.current('jump');
        }, SIMULTANEOUS_INPUT_DEFER_MS);
      },
      onPointerUp(event: React.PointerEvent<HTMLElement>) {
        clearSoloJumpSchedule();
        const pid = event.pointerId;
        if (jumpSoloEmittedPointerIdsRef.current.delete(pid)) {
          getButtonHandlers('jump').onPointerUp(event);
          syncChordInputs();
          return;
        }
        if (jumpChordConsumedRef.current) {
          jumpChordConsumedRef.current = false;
          getButtonHandlers('jump').onPointerUp(event);
          syncChordInputs();
          return;
        }
        inputHandlerRef.current?.('jump');
        getButtonHandlers('jump').onPointerUp(event);
        syncChordInputs();
      },
      onPointerCancel(event: React.PointerEvent<HTMLElement>) {
        clearSoloJumpSchedule();
        jumpSoloEmittedPointerIdsRef.current.delete(event.pointerId);
        if (jumpChordConsumedRef.current) jumpChordConsumedRef.current = false;
        getButtonHandlers('jump').onPointerCancel(event);
        syncChordInputs();
      },
    };
  }, [
    getButtonHandlers,
    getHeldChargeableSync,
    getHeldButtonsSync,
    getChargingSync,
    syncChordInputs,
    clearSoloJumpSchedule,
    cancelDeferredSoloEmitForChordPartner,
  ]);

  const getHandlers = useCallback(
    (button: ButtonType) => {
      if (button === 'shot') return wrapChargeHandlers('shot');
      if (button === 'melee') return wrapChargeHandlers('melee');
      if (button === 'jump') return wrapJumpHandlers();
      return getButtonHandlers(button);
    },
    [wrapChargeHandlers, wrapJumpHandlers, getButtonHandlers],
  );

  const getHandlersRef = useRef(getHandlers);
  getHandlersRef.current = getHandlers;

  useEffect(() => {
    const pointerFor = (physical: ArcadePhysicalButton) =>
      syntheticKeyboardPointerEvent(KEYBOARD_DEBUG_POINTER_IDS[physical]);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      const physical = debugKeyToPhysicalButton(e.key);
      if (physical === null) return;
      if (e.repeat) return;
      e.preventDefault();
      getHandlersRef.current(physical).onPointerDown(pointerFor(physical));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      const physical = debugKeyToPhysicalButton(e.key);
      if (physical === null) return;
      e.preventDefault();
      getHandlersRef.current(physical).onPointerUp(pointerFor(physical));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const isButtonActive = useCallback(
    (button: ButtonType) => {
      if (isChargeable(button)) return activeChargeButtons.has(button);
      return activeButtons.has(button);
    },
    [activeButtons, activeChargeButtons],
  );

  const physicalHighlights = resolveHighlightedPhysical(highlightedPhysicalButtons, highlightedButton);

  return (
    <div data-testid="arcade-controller" className={styles.controller}>
      {BUTTONS.map((button) => (
        <ControllerButton
          key={button}
          button={button}
          isActive={isButtonActive(button)}
          highlighted={physicalHighlights.includes(button)}
          state={buttonStateOverride}
          handlers={getHandlers(button)}
          className={styles[`btn-${button}`]}
        />
      ))}
    </div>
  );
}
