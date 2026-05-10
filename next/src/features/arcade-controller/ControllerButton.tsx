'use client';

import type { ButtonType } from '@/types';
import type { PointerHandlers } from '@/hooks/useControllerInput';
import styles from './ControllerButton.module.css';

const BUTTON_LABELS: Record<ButtonType, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャンプ',
  awaken: '覚醒',
  'shot-charge-start': '射撃チャージ開始',
  'shot-charge-end': '射撃チャージ終わり',
  'melee-charge-start': '格闘チャージ開始',
  'melee-charge-end': '格闘チャージ終わり',
  sub: 'サブ',
  'special-shot': '特射',
  'special-melee': '特格',
};

export type ControllerButtonState = 'success' | 'fail' | 'neutral';

export interface ControllerButtonProps {
  button: ButtonType;
  isActive: boolean;
  highlighted?: boolean;
  state?: ControllerButtonState;
  handlers: PointerHandlers;
  className?: string;
}

export function ControllerButton({ button, isActive, highlighted, state, handlers, className }: ControllerButtonProps) {
  return (
    <button
      role="button"
      aria-pressed={isActive}
      data-button={button}
      {...(highlighted ? { 'data-highlighted': 'true' } : {})}
      {...(state !== undefined ? { 'data-state': state } : {})}
      className={`${styles.button}${className ? ` ${className}` : ''}`}
      onPointerDown={handlers.onPointerDown}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
    >
      {BUTTON_LABELS[button]}
    </button>
  );
}
