'use client';

import { useEffect } from 'react';
import { usePracticeSession } from '@/hooks/usePracticeSession';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import { CommandHint } from './CommandHint';
import { SessionResult } from './SessionResult';
import type { ButtonType, Command } from '@/types';
import styles from './PracticeSession.module.css';

export interface PracticeSessionProps {
  command: Command;
  onExit: () => void;
}

export function PracticeSession({ command, onExit }: PracticeSessionProps) {
  const { state, start, end, handleButtonPress } = usePracticeSession();

  useEffect(() => {
    start(command);
    // command が変わった場合だけ再開始する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.id]);

  if (state.status === 'completed') {
    return (
      <SessionResult
        attempts={state.attempts}
        commandName={command.name}
        onRetry={() => start(command)}
        onExit={onExit}
      />
    );
  }

  const totalAttempts = state.attempts.length;
  const successCount = state.attempts.filter((a) => a.success).length;
  const highlightedButton: ButtonType | null =
    state.command?.sequence[state.currentIndex]?.buttons[0] ?? null;

  return (
    <div data-testid="practice-session" className={styles.session}>
      <div className={styles.header}>
        <CommandHint sequence={command.sequence} currentIndex={state.currentIndex} />
        <div data-testid="attempt-counter">
          試行: {totalAttempts} / 成功: {successCount}
        </div>
        {state.lastResult === 'success' && <div data-testid="result-success">成功!</div>}
        {state.lastResult === 'failure' && <div data-testid="result-failure">失敗...</div>}
      </div>
      <div className={styles.controllerArea}>
        <ArcadeController onButtonPress={handleButtonPress} highlightedButton={highlightedButton} />
      </div>
      <div className={styles.footer}>
        <button onClick={end}>練習終了</button>
      </div>
    </div>
  );
}
