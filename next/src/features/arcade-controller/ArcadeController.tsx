'use client';

import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { useControllerInput } from '@/hooks/useControllerInput';
import { useChargeInput, type ChargeableButton } from '@/hooks/useChargeInput';
import { ControllerButton } from './ControllerButton';
import type { ButtonType, CommandStep } from '@/types';
import styles from './ArcadeController.module.css';

export type ArcadePhysicalButton = 'shot' | 'melee' | 'jump';

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
}

export function ArcadeController({
  onButtonPress,
  onStepAdded,
  highlightedButton,
  highlightedPhysicalButtons,
}: ArcadeControllerProps) {
  const { activeButtons, getButtonHandlers, setOnButtonPress, getHeldButtonsSync } = useControllerInput();
  const {
    activeChargeButtons,
    getChargeHandlers,
    setOnInput,
    getHeldChargeableSync,
    suppressChainedOutputForChargeableButton,
  } = useChargeInput();

  const inputHandlerRef = useRef<((button: ButtonType) => void) | null>(null);
  const subComboPrevRef = useRef(false);
  const specialShotComboPrevRef = useRef(false);
  const specialMeleeComboPrevRef = useRef(false);

  useEffect(() => {
    const handler =
      onButtonPress ?? (onStepAdded ? (button: ButtonType) => onStepAdded({ buttons: [button] }) : null);
    inputHandlerRef.current = handler;
    setOnButtonPress(handler);
    setOnInput(handler);
  }, [onButtonPress, onStepAdded, setOnButtonPress, setOnInput]);

  const syncChordInputs = useCallback(() => {
    const ch = getHeldChargeableSync();
    const ctrl = getHeldButtonsSync();
    const cb = inputHandlerRef.current;

    const subCombo = ch.has('shot') && ch.has('melee');
    const specialShotCombo = ch.has('shot') && ctrl.has('jump');
    const specialMeleeCombo = ch.has('melee') && ctrl.has('jump');

    if (!cb) {
      subComboPrevRef.current = subCombo;
      specialShotComboPrevRef.current = specialShotCombo;
      specialMeleeComboPrevRef.current = specialMeleeCombo;
      return;
    }

    if (subCombo && !subComboPrevRef.current) {
      cb('sub');
      suppressChainedOutputForChargeableButton('shot');
      suppressChainedOutputForChargeableButton('melee');
    }
    subComboPrevRef.current = subCombo;

    if (specialShotCombo && !specialShotComboPrevRef.current) {
      cb('special-shot');
      suppressChainedOutputForChargeableButton('shot');
    }
    specialShotComboPrevRef.current = specialShotCombo;

    if (specialMeleeCombo && !specialMeleeComboPrevRef.current) {
      cb('special-melee');
      suppressChainedOutputForChargeableButton('melee');
    }
    specialMeleeComboPrevRef.current = specialMeleeCombo;
  }, [getHeldChargeableSync, getHeldButtonsSync, suppressChainedOutputForChargeableButton]);

  const wrapChargeHandlers = useCallback(
    (btn: ChargeableButton) => {
      const inner = getChargeHandlers(btn);
      return {
        onPointerDown(event: Parameters<typeof inner.onPointerDown>[0]) {
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
    [getChargeHandlers, syncChordInputs],
  );

  const wrapJumpHandlers = useCallback(() => {
    return {
      onPointerDown(event: React.PointerEvent<HTMLElement>) {
        const shotHeld = getHeldChargeableSync().has('shot');
        const meleeHeld = getHeldChargeableSync().has('melee');
        const suppressJump = shotHeld || meleeHeld;
        getButtonHandlers('jump', { suppressCallbackOnPointerDown: suppressJump }).onPointerDown(event);
        syncChordInputs();
      },
      onPointerUp(event: React.PointerEvent<HTMLElement>) {
        getButtonHandlers('jump').onPointerUp(event);
        syncChordInputs();
      },
      onPointerCancel(event: React.PointerEvent<HTMLElement>) {
        getButtonHandlers('jump').onPointerCancel(event);
        syncChordInputs();
      },
    };
  }, [getButtonHandlers, getHeldChargeableSync, syncChordInputs]);

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
          handlers={getHandlers(button)}
          className={styles[`btn-${button}`]}
        />
      ))}
    </div>
  );
}
