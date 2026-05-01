'use client';

import type { ButtonType } from '@/types';
import type { PointerHandlers } from '@/hooks/useControllerInput';
import styles from './ControllerButton.module.css';

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
  className?: string;
}

export function ControllerButton({ button, isActive, highlighted, handlers, className }: ControllerButtonProps) {
  return (
    <button
      role="button"
      aria-pressed={isActive}
      data-button={button}
      {...(highlighted ? { 'data-highlighted': 'true' } : {})}
      className={`${styles.button}${className ? ` ${className}` : ''}`}
      onPointerDown={handlers.onPointerDown}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
    >
      {BUTTON_LABELS[button]}
    </button>
  );
}
