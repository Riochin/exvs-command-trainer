'use client';

import { usePracticeLog } from '@/hooks/usePracticeLog';

export interface PracticeHistoryProps {
  commandId: string;
  commandName: string;
}

export function PracticeHistory({ commandId, commandName }: PracticeHistoryProps) {
  const { getLog } = usePracticeLog();
  const log = getLog(commandId);

  const attempts = log?.attempts ?? [];
  const total = attempts.length;
  const successes = attempts.filter((a) => a.success).length;
  const rate = total === 0 ? 0 : Math.round((successes / total) * 100);
  const lastTimestamp = total > 0 ? attempts[attempts.length - 1].timestamp : null;

  return (
    <div data-testid="practice-history">
      <h3>{commandName}</h3>
      {total === 0 ? (
        <p>まだ練習していません</p>
      ) : (
        <>
          <p data-testid="total-attempts">試行回数: {total}</p>
          <p data-testid="success-rate">成功率: {rate}%</p>
          {lastTimestamp && (
            <p data-testid="last-practiced">
              最終練習: {new Date(lastTimestamp).toLocaleString('ja-JP')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
