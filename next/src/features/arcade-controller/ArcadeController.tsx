'use client';

import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { useControllerInput } from '@/hooks/useControllerInput';
import { useChargeInput, type ChargeableButton } from '@/hooks/useChargeInput';
import { ControllerButton } from './ControllerButton';
import type { ButtonType, CommandStep } from '@/types';
import styles from './ArcadeController.module.css';

const BUTTONS: ButtonType[] = ['shot', 'melee', 'jump'];

function isChargeable(button: ButtonType): button is ChargeableButton {
  return button === 'shot' || button === 'melee';
}

export interface ArcadeControllerProps {
  onButtonPress?: (button: ButtonType) => void;
  onStepAdded?: (step: CommandStep) => void;
  highlightedButton?: ButtonType | null;
}

export function ArcadeController({ onButtonPress, onStepAdded, highlightedButton }: ArcadeControllerProps) {
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

  const isButtonActive = useCallback(
    (button: ButtonType) => {
      if (isChargeable(button)) return activeChargeButtons.has(button);
      return activeButtons.has(button);
    },
    [activeButtons, activeChargeButtons],
  );

  return (
    <div data-testid="arcade-controller" className={styles.controller}>
      {BUTTONS.map((button) => (
        <ControllerButton
          key={button}
          button={button}
          isActive={isButtonActive(button)}
          highlighted={highlightedButton === button}
          handlers={getHandlers(button)}
          className={styles[`btn-${button}`]}
        />
      ))}
    </div>
  );
}
