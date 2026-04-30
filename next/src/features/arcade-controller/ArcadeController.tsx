'use client';

import { useEffect } from 'react';
import { useControllerInput } from '@/hooks/useControllerInput';
import { ControllerButton } from './ControllerButton';
import type { ButtonType, CommandStep } from '@/types';

const BUTTONS: ButtonType[] = ['shot', 'melee', 'jump', 'awaken'];

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
    <div data-testid="arcade-controller">
      {BUTTONS.map((button) => (
        <ControllerButton
          key={button}
          button={button}
          isActive={activeButtons.has(button)}
          highlighted={highlightedButton === button}
          handlers={getButtonHandlers(button)}
        />
      ))}
    </div>
  );
}
