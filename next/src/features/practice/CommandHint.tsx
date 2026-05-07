'use client';

import type { ButtonType, CommandStep } from '@/types';
import styles from './CommandHint.module.css';

const BUTTON_LABELS: Record<ButtonType, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャンプ',
  awaken: '覚醒',
  'shot-charge': '射撃チャージ',
  'melee-charge': '格闘チャージ',
  sub: 'サブ',
  'special-shot': '特射',
  'special-melee': '特格',
};

export interface CommandHintProps {
  sequence: CommandStep[];
  currentIndex: number;
}

export function CommandHint({ sequence, currentIndex }: CommandHintProps) {
  return (
    <div data-testid="command-hint" className={styles.hint}>
      {sequence.map((step, index) => (
        <span
          key={index}
          data-testid="hint-step"
          data-highlighted={index === currentIndex ? 'true' : 'false'}
          className={styles.step}
        >
          {step.buttons.map((b) => BUTTON_LABELS[b]).join('+')}
        </span>
      ))}
    </div>
  );
}
