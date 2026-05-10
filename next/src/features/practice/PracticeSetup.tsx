'use client';

import { useState } from 'react';
import { CapsuleButton } from '@/components/CapsuleButton';
import type { Command } from '@/types';
import styles from './PracticeSetup.module.css';

const TIME_LIMIT = 30;

export interface PracticeSetupProps {
  command: Command;
  onStart: (timeLimit: number | null) => void;
  onBack: () => void;
}

export function PracticeSetup({ command, onStart, onBack }: PracticeSetupProps) {
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true);

  return (
    <div className={styles.container}>
      <div className={styles.title}>{command.name}</div>

      <div className={styles.setting}>
        <div className={styles.label}>時間制限</div>
        <div className={styles.toggle} role="group" aria-label="時間制限設定">
          <button
            type="button"
            className={`${styles.toggleOption} ${timeLimitEnabled ? styles.toggleOptionActive : ''}`}
            onClick={() => setTimeLimitEnabled(true)}
            aria-pressed={timeLimitEnabled}
          >
            {TIME_LIMIT}秒
          </button>
          <button
            type="button"
            className={`${styles.toggleOption} ${!timeLimitEnabled ? styles.toggleOptionActive : ''}`}
            onClick={() => setTimeLimitEnabled(false)}
            aria-pressed={!timeLimitEnabled}
          >
            制限なし
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <CapsuleButton size="lg" onClick={() => onStart(timeLimitEnabled ? TIME_LIMIT : null)}>
          開始
        </CapsuleButton>
        <CapsuleButton variant="danger" size="sm" onClick={onBack}>
          戻る
        </CapsuleButton>
      </div>
    </div>
  );
}
