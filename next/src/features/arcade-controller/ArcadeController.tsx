'use client';

import { useEffect } from 'react';
import { useControllerInput } from '@/hooks/useControllerInput';
import { ControllerButton } from './ControllerButton';
import type { ButtonType, CommandStep } from '@/types';
import styles from './ArcadeController.module.css';

const BUTTONS: ButtonType[] = ['shot', 'melee', 'jump'];

export interface ArcadeControllerProps {
  onButtonPress?: (button: ButtonType) => void;
  onStepAdded?: (step: CommandStep) => void;
  highlightedButton?: ButtonType | null;
}

export function ArcadeController({ onButtonPress, onStepAdded, highlightedButton }: ArcadeControllerProps) {
  const { activeButtons, getButtonHandlers, setOnButtonPress } = useControllerInput();

  useEffect(() => {
    if (onButtonPress) {
      setOnButtonPress(onButtonPress);
    } else if (onStepAdded) {
      setOnButtonPress((button) => {
        onStepAdded({ buttons: [button] });
      });
    } else {
      setOnButtonPress(null);
    }
  }, [onButtonPress, onStepAdded, setOnButtonPress]);

  return (
    <div data-testid="arcade-controller" className={styles.controller}>
      {BUTTONS.map((button) => (
        <ControllerButton
          key={button}
          button={button}
          isActive={activeButtons.has(button)}
          highlighted={highlightedButton === button}
          handlers={getButtonHandlers(button)}
          className={styles[`btn-${button}`]}
        />
      ))}
    </div>
  );
}
