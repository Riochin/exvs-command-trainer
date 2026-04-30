'use client';

import type { ButtonType } from '@/types';
import type { PointerHandlers } from '@/hooks/useControllerInput';

const BUTTON_LABELS: Record<ButtonType, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャンプ',
  awaken: '覚醒',
};

export interface ControllerButtonProps {
  button: ButtonType;
  isActive: boolean;
  highlighted?: boolean;
  handlers: PointerHandlers;
}

export function ControllerButton({ button, isActive, highlighted, handlers }: ControllerButtonProps) {
  return (
    <button
      role="button"
      aria-pressed={isActive}
      data-button={button}
      {...(highlighted ? { 'data-highlighted': 'true' } : {})}
      style={{ touchAction: 'none' }}
      onPointerDown={handlers.onPointerDown}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
    >
      {BUTTON_LABELS[button]}
    </button>
  );
}
