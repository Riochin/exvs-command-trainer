'use client';

import type { Command } from '@/types';
import styles from './CommandDetail.module.css';

const BUTTON_LABELS: Record<string, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャ\nンプ',
  awaken: '覚醒',
  'shot-charge-start': '射CS\n開始',
  'shot-charge-end': '射CS\n終わり',
  'melee-charge-start': '格CS\n開始',
  'melee-charge-end': '格CS\n終わり',
  sub: 'サブ',
  'special-shot': '特射',
  'special-melee': '特格',
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
      <div className={styles.sequenceList}>
        {command.sequence.map((step, i) => (
          <div key={i} data-testid="detail-step" className={styles.step}>
            <span className={styles.stepIndex}>{i + 1}</span>
            <span className={styles.stepLabel}>
              {step.buttons.map((b) => BUTTON_LABELS[b] ?? b).join('+')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
