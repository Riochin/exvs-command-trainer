'use client';

import { useReducer, useRef, useCallback } from 'react';
import { usePracticeLog } from '@/hooks/usePracticeLog';
import type { ButtonType, Command, PracticeAttempt, PracticeSessionState } from '@/types';

type Action =
  | { type: 'START'; command: Command }
  | { type: 'END' }
  | { type: 'ADVANCE' }
  | { type: 'RECORD_SUCCESS'; attempt: PracticeAttempt }
  | { type: 'RECORD_FAILURE'; attempt: PracticeAttempt };

const initialState: PracticeSessionState = {
  status: 'idle',
  command: null,
  currentIndex: 0,
  attempts: [],
  lastResult: null,
};

function reducer(state: PracticeSessionState, action: Action): PracticeSessionState {
  switch (action.type) {
    case 'START':
      return {
        status: 'active',
        command: action.command,
        currentIndex: 0,
        attempts: [],
        lastResult: null,
      };
    case 'END':
      return { ...state, status: 'completed' };
    case 'ADVANCE':
      return { ...state, currentIndex: state.currentIndex + 1 };
    case 'RECORD_SUCCESS':
      return {
        ...state,
        currentIndex: 0,
        attempts: [...state.attempts, action.attempt],
        lastResult: 'success',
      };
    case 'RECORD_FAILURE':
      return {
        ...state,
        currentIndex: 0,
        attempts: [...state.attempts, action.attempt],
        lastResult: 'failure',
      };
    default:
      return state;
  }
}

export interface AttemptAnalyticsData {
  sessionId: string;
  commandId: string;
  attemptIndex: number;
  success: boolean;
  stepReached: number;
  failureStep: number | null;
  totalDurationMs: number;
  stepTimings: Array<{ step: number; duration_ms: number }>;
  inputSequence: ButtonType[] | null;
}

export interface UsePracticeSessionOptions {
  sessionId?: string;
  onSessionStart?: (commandSnapshot: string) => void;
  onAttemptComplete?: (data: AttemptAnalyticsData) => void;
  onSessionEnd?: (stats: {
    totalAttempts: number;
    successCount: number;
    durationMs: number;
    abandoned: boolean;
    attemptsToFirstSuccess: number | null;
    bestAttemptMs: number | null;
  }) => void;
}

export interface UsePracticeSessionReturn {
  state: PracticeSessionState;
  start(command: Command): void;
  end(): void;
  handleButtonPress(button: ButtonType): void;
}

export function usePracticeSession(options?: UsePracticeSessionOptions): UsePracticeSessionReturn {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef<PracticeSessionState>(state);
  stateRef.current = state;

  const { recordAttempt } = usePracticeLog();
  const stepAccumulatorRef = useRef<Set<ButtonType>>(new Set());

  // Keep options in a ref to avoid stale closures in callbacks
  const optionsRef = useRef<UsePracticeSessionOptions | undefined>(options);
  optionsRef.current = options;

  // Timing and analytics tracking refs
  const sessionStartTimeRef = useRef<number>(0);
  const attemptStartTimeRef = useRef<number>(0);
  const stepStartTimeRef = useRef<number>(0);
  const stepTimingsAccRef = useRef<Array<{ step: number; duration_ms: number }>>([]);
  const inputSequenceAccRef = useRef<ButtonType[]>([]);
  const attemptIndexRef = useRef<number>(0);
  const firstSuccessAttemptRef = useRef<number | null>(null);
  const bestAttemptMsRef = useRef<number | null>(null);
  const successCountRef = useRef<number>(0);

  const start = useCallback((command: Command) => {
    const now = Date.now();
    stepAccumulatorRef.current = new Set();
    sessionStartTimeRef.current = now;
    attemptStartTimeRef.current = now;
    stepStartTimeRef.current = now;
    stepTimingsAccRef.current = [];
    inputSequenceAccRef.current = [];
    attemptIndexRef.current = 0;
    firstSuccessAttemptRef.current = null;
    bestAttemptMsRef.current = null;
    successCountRef.current = 0;

    optionsRef.current?.onSessionStart?.(JSON.stringify(command));
    dispatch({ type: 'START', command });
  }, []);

  const end = useCallback(() => {
    const durationMs = Date.now() - sessionStartTimeRef.current;
    const totalAttempts = attemptIndexRef.current;
    const successCount = successCountRef.current;
    optionsRef.current?.onSessionEnd?.({
      totalAttempts,
      successCount,
      durationMs,
      abandoned: successCount === 0,
      attemptsToFirstSuccess: firstSuccessAttemptRef.current,
      bestAttemptMs: bestAttemptMsRef.current,
    });
    dispatch({ type: 'END' });
  }, []);

  const handleButtonPress = useCallback(
    (button: ButtonType) => {
      const s = stateRef.current;
      if (s.status !== 'active' || !s.command) return;

      const step = s.command.sequence[s.currentIndex];

      // Track every button press in the input sequence
      inputSequenceAccRef.current.push(button);

      if (!step.buttons.includes(button)) {
        // Failure: wrong button pressed
        const now = Date.now();
        const stepDuration = now - stepStartTimeRef.current;
        const totalDurationMs = now - attemptStartTimeRef.current;
        stepTimingsAccRef.current.push({ step: s.currentIndex, duration_ms: stepDuration });

        const analyticsData: AttemptAnalyticsData = {
          sessionId: optionsRef.current?.sessionId ?? '',
          commandId: s.command.id,
          attemptIndex: attemptIndexRef.current,
          success: false,
          stepReached: s.currentIndex,
          failureStep: s.currentIndex,
          totalDurationMs,
          stepTimings: [...stepTimingsAccRef.current],
          inputSequence: [...inputSequenceAccRef.current],
        };

        // Reset for next attempt
        attemptIndexRef.current += 1;
        stepTimingsAccRef.current = [];
        inputSequenceAccRef.current = [];
        attemptStartTimeRef.current = now;
        stepStartTimeRef.current = now;

        optionsRef.current?.onAttemptComplete?.(analyticsData);

        stepAccumulatorRef.current = new Set();
        const attempt: PracticeAttempt = { success: false, timestamp: new Date().toISOString() };
        recordAttempt(s.command.id, attempt);
        dispatch({ type: 'RECORD_FAILURE', attempt });
        return;
      }

      stepAccumulatorRef.current.add(button);
      const allPressed = step.buttons.every((b) => stepAccumulatorRef.current.has(b));

      if (!allPressed) {
        // Simultaneous press — waiting for remaining buttons
        return;
      }

      stepAccumulatorRef.current = new Set();

      const now = Date.now();
      const stepDuration = now - stepStartTimeRef.current;
      stepTimingsAccRef.current.push({ step: s.currentIndex, duration_ms: stepDuration });

      const isLastStep = s.currentIndex === s.command.sequence.length - 1;
      if (isLastStep) {
        const totalDurationMs = now - attemptStartTimeRef.current;

        const analyticsData: AttemptAnalyticsData = {
          sessionId: optionsRef.current?.sessionId ?? '',
          commandId: s.command.id,
          attemptIndex: attemptIndexRef.current,
          success: true,
          stepReached: s.currentIndex,
          failureStep: null,
          totalDurationMs,
          stepTimings: [...stepTimingsAccRef.current],
          inputSequence: [...inputSequenceAccRef.current],
        };

        successCountRef.current += 1;
        if (firstSuccessAttemptRef.current === null) {
          firstSuccessAttemptRef.current = attemptIndexRef.current + 1; // 1-based
        }
        if (bestAttemptMsRef.current === null || totalDurationMs < bestAttemptMsRef.current) {
          bestAttemptMsRef.current = totalDurationMs;
        }

        // Reset for next attempt
        attemptIndexRef.current += 1;
        stepTimingsAccRef.current = [];
        inputSequenceAccRef.current = [];
        attemptStartTimeRef.current = now;
        stepStartTimeRef.current = now;

        optionsRef.current?.onAttemptComplete?.(analyticsData);

        const attempt: PracticeAttempt = { success: true, timestamp: new Date().toISOString() };
        recordAttempt(s.command.id, attempt);
        dispatch({ type: 'RECORD_SUCCESS', attempt });
      } else {
        stepStartTimeRef.current = now;
        dispatch({ type: 'ADVANCE' });
      }
    },
    [recordAttempt],
  );

  return { state, start, end, handleButtonPress };
}
