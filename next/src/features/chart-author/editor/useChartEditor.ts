'use client';

/**
 * 譜面編集のフック。reducer・Undo スタック・絞り込み・自動保存を束ねる。
 *
 * ステップの変更は必ず `chartReducer` を通す。ここが足すのは、純関数では
 * 持てない 3 つだけ:
 *   - 逆アクションを積む Undo スタック（直近 UNDO_LIMIT 件）
 *   - 表示の絞り込み（元のステップ列は削らない）
 *   - debounce つきの localStorage 自動保存
 *
 * 下書きの「復元」はここでは行わない。別の動画の下書きを黙って適用しないため、
 * 読み出しと確認は呼び出し側が持ち、復元は `replaceAll` として入ってくる。
 */
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { ButtonType, StorageError } from '@/types';
import type { ChartSource } from '@/types/chart';
import {
  CHART_AUTHOR_DRAFT_VERSION,
  DRAFT_AUTOSAVE_DELAY_MS,
  DRAFT_STORAGE_KEY,
  UNDO_LIMIT,
} from '../constants';
import type {
  ChartAuthorDraft,
  DetectedStep,
  EditorAction,
  EditorState,
  EditorStep,
  RerunStrategy,
  StepFilter,
  VideoKey,
} from '../types';
import { chartReducer } from './chartReducer';
import { findNearestStep as nearestOf } from './nearestStep';

export interface UseChartEditorOptions {
  readonly initialSteps?: readonly EditorStep[];
  /** どの動画に対する作業かの手がかり。下書きに載せる */
  readonly videoKey?: VideoKey | null;
  readonly source?: ChartSource;
  readonly autoSaveDelayMs?: number;
}

export interface UseChartEditorReturn {
  readonly steps: readonly EditorStep[];
  readonly visibleSteps: readonly EditorStep[];
  readonly selectedId: string | null;
  readonly filter: StepFilter;
  readonly canUndo: boolean;
  readonly lastStorageError: StorageError | null;
  addStep(tMs: number, input: ButtonType): void;
  removeStep(id: string): void;
  nudgeStep(id: string, frames: number): void;
  changeStepInput(id: string, input: ButtonType): void;
  applyGlobalOffset(offsetMs: number): void;
  adoptDetections(steps: readonly DetectedStep[], strategy: RerunStrategy): void;
  replaceAll(steps: readonly EditorStep[]): void;
  select(id: string | null): void;
  setFilter(filter: StepFilter): void;
  undo(): void;
  findNearestStep(tMs: number): EditorStep | null;
}

export const DEFAULT_STEP_FILTER: StepFilter = {
  inputs: null,
  origins: null,
  minConfidence: 0,
};

const DEFAULT_SOURCE: ChartSource = { type: 'file', offsetMs: 0 };

/** 編集状態と Undo スタックは常に一緒に動くので、1 つの reducer が持つ */
type Session = {
  readonly state: EditorState;
  readonly undoStack: readonly EditorAction[];
  /** 編集が起きた回数。0 なら未編集で、自動保存を走らせない */
  readonly revision: number;
};

type SessionAction =
  | { readonly kind: 'edit'; readonly action: EditorAction }
  | { readonly kind: 'undo' }
  | { readonly kind: 'select'; readonly id: string | null };

function sessionReducer(session: Session, action: SessionAction): Session {
  switch (action.kind) {
    case 'edit': {
      const { next, inverse } = chartReducer(session.state, action.action);
      // 何も変えなかった操作で履歴を埋めない
      if (inverse === null) return session;
      const stack = [...session.undoStack, inverse];
      return {
        state: next,
        undoStack: stack.length > UNDO_LIMIT ? stack.slice(stack.length - UNDO_LIMIT) : stack,
        revision: session.revision + 1,
      };
    }
    case 'undo': {
      const inverse = session.undoStack[session.undoStack.length - 1];
      if (inverse === undefined) return session;
      // Undo の結果は履歴に積まない（Redo は要件にない）
      return {
        state: chartReducer(session.state, inverse).next,
        undoStack: session.undoStack.slice(0, -1),
        revision: session.revision + 1,
      };
    }
    case 'select':
      // 選択は譜面の内容ではないので、Undo にも下書きにも関わらない
      return { ...session, state: { ...session.state, selectedId: action.id } };
  }
}

function createSession(initialSteps: readonly EditorStep[]): Session {
  return {
    state: { steps: [...initialSteps].sort((a, b) => a.tMs - b.tMs), selectedId: null },
    undoStack: [],
    revision: 0,
  };
}

function matchesFilter(step: EditorStep, filter: StepFilter): boolean {
  // null は「絞り込まない」。空配列は「どれも選んでいない」なので 1 件も通さない
  if (filter.inputs !== null && !filter.inputs.includes(step.input)) return false;
  if (filter.origins !== null && !filter.origins.includes(step.origin)) return false;
  return step.confidence >= filter.minConfidence;
}

export function useChartEditor(options: UseChartEditorOptions = {}): UseChartEditorReturn {
  const {
    initialSteps,
    videoKey = null,
    source = DEFAULT_SOURCE,
    autoSaveDelayMs = DRAFT_AUTOSAVE_DELAY_MS,
  } = options;

  const [session, dispatch] = useReducer(
    sessionReducer,
    initialSteps ?? [],
    createSession,
  );
  const [filter, setFilter] = useState<StepFilter>(DEFAULT_STEP_FILTER);
  const [lastStorageError, setLastStorageError] = useState<StorageError | null>(null);

  const { setValue: saveDraft } = useLocalStorage<ChartAuthorDraft | null>(
    DRAFT_STORAGE_KEY,
    null,
  );

  const { steps, selectedId } = session.state;
  const { revision } = session;

  const visibleSteps = useMemo(
    () => steps.filter((step) => matchesFilter(step, filter)),
    [steps, filter],
  );

  // 自動保存。編集が起きてからのみ走らせ、未編集の空譜面で既存の下書きを潰さない
  useEffect(() => {
    if (revision === 0) return;

    const timer = setTimeout(() => {
      const result = saveDraft({
        version: CHART_AUTHOR_DRAFT_VERSION,
        videoKey,
        source,
        steps,
        savedAt: new Date().toISOString(),
      });
      // 失敗しても編集は止めない。エクスポートを促すのは UI の仕事
      setLastStorageError(result.ok ? null : result.error);
    }, autoSaveDelayMs);

    return () => clearTimeout(timer);
  }, [revision, steps, videoKey, source, autoSaveDelayMs, saveDraft]);

  const edit = useCallback((action: EditorAction) => dispatch({ kind: 'edit', action }), []);

  const addStep = useCallback(
    (tMs: number, input: ButtonType) => edit({ type: 'ADD_STEP', tMs, input }),
    [edit],
  );
  const removeStep = useCallback((id: string) => edit({ type: 'REMOVE_STEP', id }), [edit]);
  const nudgeStep = useCallback(
    (id: string, frames: number) => edit({ type: 'NUDGE_STEP', id, frames }),
    [edit],
  );
  const changeStepInput = useCallback(
    (id: string, input: ButtonType) => edit({ type: 'CHANGE_INPUT', id, input }),
    [edit],
  );
  const applyGlobalOffset = useCallback(
    (offsetMs: number) => edit({ type: 'APPLY_GLOBAL_OFFSET', offsetMs }),
    [edit],
  );
  const adoptDetections = useCallback(
    (detections: readonly DetectedStep[], strategy: RerunStrategy) =>
      edit({ type: 'ADOPT_DETECTIONS', steps: detections, strategy }),
    [edit],
  );
  const replaceAll = useCallback(
    (next: readonly EditorStep[]) => edit({ type: 'REPLACE_ALL', steps: next }),
    [edit],
  );
  const select = useCallback((id: string | null) => dispatch({ kind: 'select', id }), []);
  const undo = useCallback(() => dispatch({ kind: 'undo' }), []);

  /** 一覧で光らせる相手を返すので、絞り込みで隠れているステップは選ばない */
  const findNearestStep = useCallback(
    (tMs: number): EditorStep | null => nearestOf(visibleSteps, tMs),
    [visibleSteps],
  );

  return {
    steps,
    visibleSteps,
    selectedId,
    filter,
    canUndo: session.undoStack.length > 0,
    lastStorageError,
    addStep,
    removeStep,
    nudgeStep,
    changeStepInput,
    applyGlobalOffset,
    adoptDetections,
    replaceAll,
    select,
    setFilter,
    undo,
    findNearestStep,
  };
}
