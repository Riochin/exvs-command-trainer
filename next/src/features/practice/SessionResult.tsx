'use client';

import type { PracticeAttempt } from '@/types';
import styles from './SessionResult.module.css';

export interface SessionResultProps {
  attempts: PracticeAttempt[];
  commandName: string;
  onRetry: () => void;
  onExit: () => void;
}

export function SessionResult({ attempts, commandName, onRetry, onExit }: SessionResultProps) {
  const total = attempts.length;
  const successes = attempts.filter((a) => a.success).length;
  const rate = total === 0 ? 0 : Math.round((successes / total) * 100);

  return (
    <div data-testid="session-result" className={styles.result}>
      <h2 className={styles.title}>{commandName}</h2>
      {total === 0 ? (
        <p className={styles.emptyMessage}>まだ練習していません</p>
      ) : (
        <>
          <p data-testid="total-attempts" className={styles.stat}>試行回数: {total}</p>
          <p data-testid="success-count" className={styles.stat}>成功: {successes}</p>
          <p data-testid="success-rate" className={styles.stat}>成功率: {rate}%</p>
        </>
      )}
      <div className={styles.actions}>
        <button className={styles.retryButton} onClick={onRetry}>もう一度</button>
        <button className={styles.exitButton} onClick={onExit}>終了</button>
      </div>
    </div>
  );
}
