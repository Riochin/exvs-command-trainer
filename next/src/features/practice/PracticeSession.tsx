'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePracticeSession } from '@/hooks/usePracticeSession';
import type { UsePracticeSessionOptions } from '@/hooks/usePracticeSession';
import { useAnalytics } from '@/features/analytics/useAnalytics';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import type { ControllerButtonState } from '@/features/arcade-controller/ControllerButton';
import { CommandHint } from './CommandHint';
import { SessionResult } from './SessionResult';
import { CapsuleButton } from '@/components/CapsuleButton';
import type { ButtonType, Command } from '@/types';
import type { ArcadePhysicalButton } from '@/features/arcade-controller/ArcadeController';
import styles from './PracticeSession.module.css';

/** 現在ステップの ButtonType を、アケコン上で灯す物理ボタンに展開する */
export function practiceStepToPhysicalHighlights(stepButton: ButtonType): ArcadePhysicalButton[] {
  switch (stepButton) {
    case 'shot-charge-start':
    case 'shot-charge-end':
      return ['shot'];
    case 'melee-charge-start':
    case 'melee-charge-end':
      return ['melee'];
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
  timeLimit?: number | null;
}

export function PracticeSession({ command, onExit, timeLimit = null }: PracticeSessionProps) {
  const { trackSessionStart, trackAttempt, trackSessionEnd } = useAnalytics();

  // sessionId はセッション開始ごとに新しい UUID を生成して ref に保持
  const sessionIdRef = useRef('');

  const analyticsOptions: UsePracticeSessionOptions = {
    onSessionStart: (commandSnapshot) => {
      sessionIdRef.current = crypto.randomUUID();
      trackSessionStart({
        sessionId: sessionIdRef.current,
        commandId: command.id,
        commandSnapshot,
        deviceType: 'mobile',
        timeLimitMs: timeLimit ?? undefined,
      });
    },
    onAttemptComplete: (data) => {
      trackAttempt({ ...data, sessionId: sessionIdRef.current });
    },
    onSessionEnd: (stats) => {
      trackSessionEnd(sessionIdRef.current, {
        endedAt: new Date().toISOString(),
        totalAttempts: stats.totalAttempts,
        successCount: stats.successCount,
        durationMs: stats.durationMs,
        abandoned: stats.abandoned,
        attemptsToFirstSuccess: stats.attemptsToFirstSuccess,
        bestAttemptMs: stats.bestAttemptMs,
      });
    },
  };

  const { state, start, end, handleButtonPress } = usePracticeSession(analyticsOptions);
  const [controllerFeedback, setControllerFeedback] = useState<ControllerButtonState>('neutral');
  const [timeLeft, setTimeLeft] = useState<number | null>(timeLimit);

  useEffect(() => {
    start(command);
    // command が変わった場合だけ再開始する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.id]);

  useEffect(() => {
    if (state.status === 'active') {
      setTimeLeft(timeLimit);
    }
  }, [state.status, timeLimit]);

  useEffect(() => {
    if (timeLeft === null || state.status !== 'active') return;
    if (timeLeft <= 0) {
      end();
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => (t !== null ? t - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, state.status, end]);

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
        <div className={styles.headerMain}>
          <CommandHint sequence={command.sequence} currentIndex={state.currentIndex} />
          <div className={styles.statsRow}>
            <div data-testid="attempt-counter" className={styles.attemptCounter}>
              試行: {totalAttempts} / 成功: {successCount}
            </div>
            {timeLeft !== null && (
              <div
                data-testid="timer"
                className={timeLeft <= 10 ? styles.timerWarning : styles.timer}
              >
                {timeLeft}s
              </div>
            )}
            {state.lastResult === 'success' && <div data-testid="result-success" className={styles.resultSuccess}>SUCCESS</div>}
            {state.lastResult === 'failure' && <div data-testid="result-failure" className={styles.resultFailure}>MISS</div>}
          </div>
        </div>
        <CapsuleButton variant="danger" onClick={end}>練習終了</CapsuleButton>
      </div>
      <div className={styles.controllerArea}>
        <ArcadeController
          onButtonPress={wrappedHandleButtonPress}
          highlightedPhysicalButtons={highlightedPhysicalButtons}
          buttonStateOverride={controllerFeedback}
        />
      </div>
    </div>
  );
}
