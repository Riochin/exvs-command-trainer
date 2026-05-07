'use client';

import type { Command } from '@/types';
import styles from './CommandDetail.module.css';

const BUTTON_LABELS: Record<string, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャンプ',
  awaken: '覚醒',
};

export interface CommandDetailProps {
  command: Command | null | undefined;
}

export function CommandDetail({ command }: CommandDetailProps) {
  if (!command) {
    return <p className={styles.notFound}>コマンドが見つかりません</p>;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{command.name}</h1>
      <p className={styles.mobileSuit}>{command.mobileSuit}</p>
      <ol className={styles.sequenceList}>
        {command.sequence.map((step, i) => (
          <li key={i} data-testid="detail-step" className={styles.step}>
            {step.buttons.map((b) => BUTTON_LABELS[b] ?? b).join('+')}
          </li>
        ))}
      </ol>
    </div>
  );
}
