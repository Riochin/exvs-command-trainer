/**
 * 譜面編集の状態機械。純関数。
 *
 * ステップ配列の唯一の所有者であり、どの経路の編集もこの 1 枚を通る。
 * 各アクションは「適用結果」と「それを打ち消すアクション」の組を返し、
 * Undo は逆アクションの適用として実現される（逆操作の合成ではない）。
 *
 * 不変条件は 2 つだけで、すべてのアクションの出口で成り立たせる:
 *   - steps は tMs 昇順
 *   - すべての tMs は 0 以上
 * 後者を守るために、範囲を外す操作は「切り詰め」ではなく「拒否」を選ぶ。
 * 切り詰めると相対順序が崩れ、全体オフセットの意味（Req 7.8）が壊れるため。
 */
import { v4 as uuidv4 } from 'uuid';
import { isButtonType } from '@/types';
import type { ButtonType } from '@/types';
import { FRAME_DURATION_MS } from '../constants';
import type {
  DetectedStep,
  EditorAction,
  EditorState,
  EditorStep,
  ReducerOutcome,
  RerunStrategy,
} from '../types';

/** 何も起きなかったことを表す結果。Undo スタックへは積ませない */
function noop(state: EditorState): ReducerOutcome {
  return { next: state, inverse: null };
}

/**
 * 変更前の全ステップへ戻す逆操作。
 *
 * 削除・昇格・取り込みのように情報が落ちる操作は、同種のアクションでは
 * 元へ戻せない（削除は id ごと消え、時刻調整と種別変更は origin と
 * confidence を昇格させてしまう）。全置換なら常に正確に戻せる。
 * オフセットも -offset で戻すと浮動小数の誤差が残るため、ここに寄せる。
 */
function restoreTo(state: EditorState): EditorAction {
  return { type: 'REPLACE_ALL', steps: state.steps };
}

/** tMs 昇順へ整える。同時刻の相対順序は入力順のまま保つ（sort は安定） */
function sortSteps(steps: readonly EditorStep[]): readonly EditorStep[] {
  return [...steps].sort((a, b) => a.tMs - b.tMs);
}

/** 消えたステップを選択したままにしない */
function keepSelection(steps: readonly EditorStep[], selectedId: string | null): string | null {
  if (selectedId === null) return null;
  return steps.some((step) => step.id === selectedId) ? selectedId : null;
}

function commit(steps: readonly EditorStep[], state: EditorState): EditorState {
  const sorted = sortSteps(steps);
  return { steps: sorted, selectedId: keepSelection(sorted, state.selectedId) };
}

/** 手動で触れたステップは手動扱いへ昇格させる（Req 7.6） */
function promoteToManual(step: EditorStep): EditorStep {
  // detector と caveat は「どの検出器が出した候補か」という履歴なので残す
  return { ...step, origin: 'manual', confidence: 1 };
}

function toEditorStep(detection: DetectedStep): EditorStep {
  return {
    id: uuidv4(),
    tMs: detection.tMs,
    input: detection.input,
    confidence: detection.confidence,
    origin: 'auto',
    detector: detection.detector,
    caveat: detection.caveat,
  };
}

/** 対象ステップを 1 件だけ差し替える。対象がなければ null */
function replaceStep(
  state: EditorState,
  id: string,
  update: (step: EditorStep) => EditorStep | null,
): readonly EditorStep[] | null {
  const index = state.steps.findIndex((step) => step.id === id);
  if (index < 0) return null;

  const updated = update(state.steps[index]);
  if (updated === null) return null;

  const next = [...state.steps];
  next[index] = updated;
  return next;
}

function addStep(state: EditorState, tMs: number, input: ButtonType): ReducerOutcome {
  if (!Number.isFinite(tMs) || tMs < 0 || !isButtonType(input)) return noop(state);

  const created: EditorStep = {
    id: uuidv4(),
    tMs,
    input,
    confidence: 1,
    origin: 'manual',
    detector: null,
    caveat: 'none',
  };

  return {
    next: commit([...state.steps, created], state),
    inverse: { type: 'REMOVE_STEP', id: created.id },
  };
}

function removeStep(state: EditorState, id: string): ReducerOutcome {
  const remaining = state.steps.filter((step) => step.id !== id);
  if (remaining.length === state.steps.length) return noop(state);

  return { next: commit(remaining, state), inverse: restoreTo(state) };
}

function nudgeStep(state: EditorState, id: string, frames: number): ReducerOutcome {
  if (!Number.isInteger(frames) || frames === 0) return noop(state);

  const moved = replaceStep(state, id, (step) => {
    const tMs = step.tMs + frames * FRAME_DURATION_MS;
    // 負へ抜ける移動は拒否する。0 で止めると隣接ステップとの間隔が嘘になる
    return tMs < 0 ? null : promoteToManual({ ...step, tMs });
  });
  if (moved === null) return noop(state);

  return { next: commit(moved, state), inverse: restoreTo(state) };
}

function changeInput(state: EditorState, id: string, input: ButtonType): ReducerOutcome {
  if (!isButtonType(input)) return noop(state);

  const changed = replaceStep(state, id, (step) =>
    step.input === input ? null : promoteToManual({ ...step, input }),
  );
  if (changed === null) return noop(state);

  return { next: commit(changed, state), inverse: restoreTo(state) };
}

function applyGlobalOffset(state: EditorState, offsetMs: number): ReducerOutcome {
  if (!Number.isFinite(offsetMs) || offsetMs === 0 || state.steps.length === 0) {
    return noop(state);
  }
  // 1 件でも負へ抜けるなら適用しない。個別に切り詰めると相対順序が崩れる
  if (state.steps.some((step) => step.tMs + offsetMs < 0)) return noop(state);

  const shifted = state.steps.map((step) => ({ ...step, tMs: step.tMs + offsetMs }));
  return { next: commit(shifted, state), inverse: restoreTo(state) };
}

function adoptDetections(
  state: EditorState,
  detections: readonly DetectedStep[],
  strategy: RerunStrategy,
): ReducerOutcome {
  // replace_auto_only では手動ステップを 1 件も落とさない（Req 5.4）
  const kept = strategy === 'replace_auto_only'
    ? state.steps.filter((step) => step.origin === 'manual')
    : [];

  return {
    next: commit([...kept, ...detections.map(toEditorStep)], state),
    inverse: restoreTo(state),
  };
}

export function chartReducer(state: EditorState, action: EditorAction): ReducerOutcome {
  switch (action.type) {
    case 'ADD_STEP':
      return addStep(state, action.tMs, action.input);
    case 'REMOVE_STEP':
      return removeStep(state, action.id);
    case 'NUDGE_STEP':
      return nudgeStep(state, action.id, action.frames);
    case 'CHANGE_INPUT':
      return changeInput(state, action.id, action.input);
    case 'APPLY_GLOBAL_OFFSET':
      return applyGlobalOffset(state, action.offsetMs);
    case 'ADOPT_DETECTIONS':
      return adoptDetections(state, action.steps, action.strategy);
    case 'REPLACE_ALL':
      return { next: commit(action.steps, state), inverse: restoreTo(state) };
  }
}
