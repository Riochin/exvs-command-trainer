'use client';

import { useEffect, useRef } from 'react';
import type { ButtonType, CommandStep } from '@/types';
import styles from './CommandHint.module.css';

const BUTTON_LABELS: Record<ButtonType, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャ\nンプ',
  bd: 'BD',
  awaken: '覚醒',
  'shot-charge-start': '射CS\n開始',
  'shot-charge-end': '射CS\n終わり',
  'melee-charge-start': '格CS\n開始',
  'melee-charge-end': '格CS\n終わり',
  sub: 'サブ',
  'special-shot': '特射',
  'special-melee': '特格',
};

type DisplayItem =
  | { kind: 'step'; index: number }
  | { kind: 'pair'; startIndex: number; endIndex: number; chargeType: 'shot' | 'melee' };

function buildDisplayItems(sequence: CommandStep[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let i = 0;
  while (i < sequence.length) {
    const btn = sequence[i].buttons[0];
    if (btn === 'shot-charge-start' && sequence[i + 1]?.buttons[0] === 'shot-charge-end') {
      items.push({ kind: 'pair', startIndex: i, endIndex: i + 1, chargeType: 'shot' });
      i += 2;
    } else if (btn === 'melee-charge-start' && sequence[i + 1]?.buttons[0] === 'melee-charge-end') {
      items.push({ kind: 'pair', startIndex: i, endIndex: i + 1, chargeType: 'melee' });
      i += 2;
    } else {
      items.push({ kind: 'step', index: i });
      i += 1;
    }
  }
  return items;
}

export interface CommandHintProps {
  sequence: CommandStep[];
  currentIndex: number;
}

export function CommandHint({ sequence, currentIndex }: CommandHintProps) {
  const stepRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const items = buildDisplayItems(sequence);
    const item = items.find((it) =>
      it.kind === 'step'
        ? it.index === currentIndex
        : it.startIndex === currentIndex || it.endIndex === currentIndex,
    );
    if (!item) return;
    const refIndex = item.kind === 'step' ? item.index : item.startIndex;
    stepRefs.current[refIndex]?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [currentIndex, sequence]);

  const displayItems = buildDisplayItems(sequence);

  return (
    <div data-testid="command-hint" className={styles.hint}>
      {displayItems.map((item, i) => {
        if (item.kind === 'step') {
          const step = sequence[item.index];
          const highlighted = item.index === currentIndex;
          return (
            <span
              key={i}
              ref={(el) => { stepRefs.current[item.index] = el; }}
              data-testid="hint-step"
              data-highlighted={highlighted ? 'true' : 'false'}
              className={styles.step}
            >
              {step.buttons.map((b) => BUTTON_LABELS[b]).join('+')}
            </span>
          );
        } else {
          const highlighted = currentIndex === item.startIndex || currentIndex === item.endIndex;
          const label = item.chargeType === 'shot' ? '射CS' : '格CS';
          return (
            <span
              key={i}
              ref={(el) => { stepRefs.current[item.startIndex] = el; }}
              data-testid="hint-step"
              data-highlighted={highlighted ? 'true' : 'false'}
              className={styles.step}
            >
              {label}
            </span>
          );
        }
      })}
    </div>
  );
}
