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

export interface UsePracticeSessionReturn {
  state: PracticeSessionState;
  start(command: Command): void;
  end(): void;
  handleButtonPress(button: ButtonType): void;
}

export function usePracticeSession(): UsePracticeSessionReturn {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef<PracticeSessionState>(state);
  stateRef.current = state;

  const { recordAttempt } = usePracticeLog();
  const stepAccumulatorRef = useRef<Set<ButtonType>>(new Set());

  const start = useCallback((command: Command) => {
    stepAccumulatorRef.current = new Set();
    dispatch({ type: 'START', command });
  }, []);

  const end = useCallback(() => {
    dispatch({ type: 'END' });
  }, []);

  const handleButtonPress = useCallback(
    (button: ButtonType) => {
      const s = stateRef.current;
      if (s.status !== 'active' || !s.command) return;

      const step = s.command.sequence[s.currentIndex];

      if (!step.buttons.includes(button)) {
        stepAccumulatorRef.current = new Set();
        const attempt: PracticeAttempt = { success: false, timestamp: new Date().toISOString() };
        recordAttempt(s.command.id, attempt);
        dispatch({ type: 'RECORD_FAILURE', attempt });
        return;
      }

      stepAccumulatorRef.current.add(button);
      const allPressed = step.buttons.every((b) => stepAccumulatorRef.current.has(b));

      if (!allPressed) {
        // 同時押しステップの途中 — まだ他のボタンが必要
        return;
      }

      stepAccumulatorRef.current = new Set();

      const isLastStep = s.currentIndex === s.command.sequence.length - 1;
      if (isLastStep) {
        const attempt: PracticeAttempt = { success: true, timestamp: new Date().toISOString() };
        recordAttempt(s.command.id, attempt);
        dispatch({ type: 'RECORD_SUCCESS', attempt });
      } else {
        dispatch({ type: 'ADVANCE' });
      }
    },
    [recordAttempt],
  );

  return { state, start, end, handleButtonPress };
}
