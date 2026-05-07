'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePracticeSession } from '@/hooks/usePracticeSession';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import type { ControllerButtonState } from '@/features/arcade-controller/ControllerButton';
import { CommandHint } from './CommandHint';
import { SessionResult } from './SessionResult';
import type { ButtonType, Command } from '@/types';
import type { ArcadePhysicalButton } from '@/features/arcade-controller/ArcadeController';
import styles from './PracticeSession.module.css';

/** 現在ステップの ButtonType を、アケコン上で灯す物理ボタンに展開する */
export function practiceStepToPhysicalHighlights(stepButton: ButtonType): ArcadePhysicalButton[] {
  switch (stepButton) {
    case 'melee-charge':
      return ['melee'];
    case 'shot-charge':
      return ['shot'];
    case 'sub':
      return ['shot', 'melee'];
    case 'special-shot':
      return ['shot', 'jump'];
    case 'special-melee':
      return ['melee', 'jump'];
    case 'shot':
    case 'melee':
    case 'jump':
      return [stepButton];
    default:
      return [];
  }
}

export interface PracticeSessionProps {
  command: Command;
  onExit: () => void;
}

export function PracticeSession({ command, onExit }: PracticeSessionProps) {
  const { state, start, end, handleButtonPress } = usePracticeSession();
  const [controllerFeedback, setControllerFeedback] = useState<ControllerButtonState>('neutral');

  useEffect(() => {
    start(command);
    // command が変わった場合だけ再開始する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.id]);

  useEffect(() => {
    if (state.lastResult === 'success') {
      setControllerFeedback('success');
    } else if (state.lastResult === 'failure') {
      setControllerFeedback('fail');
    } else {
      setControllerFeedback('neutral');
    }
  }, [state.lastResult]);

  const wrappedHandleButtonPress = useCallback(
    (button: ButtonType) => {
      setControllerFeedback('neutral');
      handleButtonPress(button);
    },
    [handleButtonPress],
  );

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
  const currentStepButton: ButtonType | null =
    state.command?.sequence[state.currentIndex]?.buttons[0] ?? null;
  const highlightedPhysicalButtons: ArcadePhysicalButton[] = currentStepButton
    ? practiceStepToPhysicalHighlights(currentStepButton)
    : [];

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
        <ArcadeController
          onButtonPress={wrappedHandleButtonPress}
          highlightedPhysicalButtons={highlightedPhysicalButtons}
          buttonStateOverride={controllerFeedback}
        />
      </div>
      <div className={styles.footer}>
        <button onClick={end}>練習終了</button>
      </div>
    </div>
  );
}
