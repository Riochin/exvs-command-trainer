'use client';

import type { Command, CommandStep } from '@/types';
import styles from './CommandDetail.module.css';

const BUTTON_LABELS: Record<string, string> = {
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
  | { kind: 'pair'; startIndex: number; label: string };

function buildDisplayItems(sequence: CommandStep[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let i = 0;
  while (i < sequence.length) {
    const btn = sequence[i].buttons[0];
    if (btn === 'shot-charge-start' && sequence[i + 1]?.buttons[0] === 'shot-charge-end') {
      items.push({ kind: 'pair', startIndex: i, label: '射CS' });
      i += 2;
    } else if (btn === 'melee-charge-start' && sequence[i + 1]?.buttons[0] === 'melee-charge-end') {
      items.push({ kind: 'pair', startIndex: i, label: '格CS' });
      i += 2;
    } else {
      items.push({ kind: 'step', index: i });
      i += 1;
    }
  }
  return items;
}

export interface CommandDetailProps {
  command: Command | null | undefined;
}

export function CommandDetail({ command }: CommandDetailProps) {
  if (!command) {
    return <p className={styles.notFound}>コマンドが見つかりません</p>;
  }

  const displayItems = buildDisplayItems(command.sequence);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{command.name}</h1>
      <p className={styles.mobileSuit}>{command.mobileSuit}</p>
      <div className={styles.sequenceList}>
        {displayItems.map((item, i) => (
          <div key={i} data-testid="detail-step" className={styles.step}>
            <span className={styles.stepIndex}>{i + 1}</span>
            <span className={styles.stepLabel}>
              {item.kind === 'pair'
                ? item.label
                : command.sequence[item.index].buttons.map((b) => BUTTON_LABELS[b] ?? b).join('+')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
