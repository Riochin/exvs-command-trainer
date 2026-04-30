'use client';

import type { PracticeAttempt } from '@/types';

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
    <div data-testid="session-result">
      <h2>{commandName}</h2>
      {total === 0 ? (
        <p>まだ練習していません</p>
      ) : (
        <>
          <p data-testid="total-attempts">試行回数: {total}</p>
          <p data-testid="success-count">成功: {successes}</p>
          <p data-testid="success-rate">成功率: {rate}%</p>
        </>
      )}
      <button onClick={onRetry}>もう一度</button>
      <button onClick={onExit}>終了</button>
    </div>
  );
}
