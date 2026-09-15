import { describe, it, expect } from 'vitest';
import { chartReducer } from '@/features/chart-author/editor/chartReducer';
import { FRAME_DURATION_MS } from '@/features/chart-author/constants';
import type {
  DetectedStep,
  EditorAction,
  EditorState,
  EditorStep,
} from '@/features/chart-author/types';
import type { ButtonType } from '@/types';

function step(patch: Partial<EditorStep> & { id: string; tMs: number }): EditorStep {
  return {
    input: 'shot',
    confidence: 0.9,
    origin: 'auto',
    detector: 'ammo',
    caveat: 'none',
    ...patch,
  };
}

function stateOf(steps: readonly EditorStep[], selectedId: string | null = null): EditorState {
  return { steps, selectedId };
}

function detected(patch: Partial<DetectedStep> & { tMs: number }): DetectedStep {
  return {
    input: 'shot',
    confidence: 0.8,
    detector: 'ammo',
    caveat: 'none',
    ...patch,
  };
}

/** 出口の不変条件: tMs 昇順 */
function isAscending(steps: readonly EditorStep[]): boolean {
  return steps.every((s, i) => i === 0 || steps[i - 1].tMs <= s.tMs);
}

const AUTO_A = step({ id: 'a', tMs: 1000, input: 'shot' });
const MANUAL_B = step({ id: 'b', tMs: 2000, input: 'melee', origin: 'manual', confidence: 1, detector: null });
const AUTO_C = step({ id: 'c', tMs: 3000, input: 'sub' });
const BASE = stateOf([AUTO_A, MANUAL_B, AUTO_C]);

describe('chartReducer / ADD_STEP', () => {
  it('現在位置に origin manual・confidence 1 のステップを作る', () => {
    const { next } = chartReducer(stateOf([]), { type: 'ADD_STEP', tMs: 1500, input: 'bd' });

    expect(next.steps).toHaveLength(1);
    expect(next.steps[0]).toMatchObject({
      tMs: 1500,
      input: 'bd',
      origin: 'manual',
      confidence: 1,
      detector: null,
      caveat: 'none',
    });
    expect(next.steps[0].id).toBeTruthy();
  });

  it('時刻順の正しい位置に差し込む', () => {
    const { next } = chartReducer(BASE, { type: 'ADD_STEP', tMs: 1500, input: 'bd' });

    expect(next.steps.map((s) => s.tMs)).toEqual([1000, 1500, 2000, 3000]);
    expect(isAscending(next.steps)).toBe(true);
  });

  it('追加した id を指す REMOVE_STEP を逆操作として返す', () => {
    const { next, inverse } = chartReducer(BASE, { type: 'ADD_STEP', tMs: 1500, input: 'bd' });
    const added = next.steps.find((s) => s.tMs === 1500);

    expect(inverse).toEqual({ type: 'REMOVE_STEP', id: added?.id });
    expect(chartReducer(next, inverse as EditorAction).next).toEqual(BASE);
  });

  it('追加ごとに異なる id を割り当てる', () => {
    const first = chartReducer(stateOf([]), { type: 'ADD_STEP', tMs: 1000, input: 'shot' }).next;
    const second = chartReducer(first, { type: 'ADD_STEP', tMs: 1000, input: 'shot' }).next;

    expect(second.steps[0].id).not.toBe(second.steps[1].id);
  });

  it('負の時刻への追加は拒否する', () => {
    const outcome = chartReducer(BASE, { type: 'ADD_STEP', tMs: -1, input: 'bd' });

    expect(outcome.next).toBe(BASE);
    expect(outcome.inverse).toBeNull();
  });

  it('入力種別が ButtonType でなければ拒否する', () => {
    const outcome = chartReducer(BASE, {
      type: 'ADD_STEP',
      tMs: 1500,
      input: 'ultra' as ButtonType,
    });

    expect(outcome.next).toBe(BASE);
    expect(outcome.inverse).toBeNull();
  });
});

describe('chartReducer / REMOVE_STEP', () => {
  it('指定したステップを取り除く', () => {
    const { next } = chartReducer(BASE, { type: 'REMOVE_STEP', id: 'b' });

    expect(next.steps.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('選択中のステップを消したら選択を外す', () => {
    const { next } = chartReducer(stateOf(BASE.steps, 'b'), { type: 'REMOVE_STEP', id: 'b' });

    expect(next.selectedId).toBeNull();
  });

  it('選択していないステップを消しても選択は保つ', () => {
    const { next } = chartReducer(stateOf(BASE.steps, 'a'), { type: 'REMOVE_STEP', id: 'b' });

    expect(next.selectedId).toBe('a');
  });

  it('逆操作で削除前の状態へ戻る', () => {
    const selected = stateOf(BASE.steps, 'b');
    const { next, inverse } = chartReducer(selected, { type: 'REMOVE_STEP', id: 'b' });

    expect(chartReducer(next, inverse as EditorAction).next.steps).toEqual(selected.steps);
  });

  it('存在しない id は何もしない', () => {
    const outcome = chartReducer(BASE, { type: 'REMOVE_STEP', id: 'zzz' });

    expect(outcome.next).toBe(BASE);
    expect(outcome.inverse).toBeNull();
  });
});

describe('chartReducer / NUDGE_STEP', () => {
  it('コマ単位で時刻を動かす', () => {
    const { next } = chartReducer(BASE, { type: 'NUDGE_STEP', id: 'a', frames: 2 });

    expect(next.steps[0].tMs).toBeCloseTo(1000 + 2 * FRAME_DURATION_MS, 6);
  });

  it('負のコマ数で手前へ動かす', () => {
    const { next } = chartReducer(BASE, { type: 'NUDGE_STEP', id: 'a', frames: -1 });

    expect(next.steps[0].tMs).toBeCloseTo(1000 - FRAME_DURATION_MS, 6);
  });

  it('移動で順序が入れ替わるなら並べ直す', () => {
    const { next } = chartReducer(BASE, { type: 'NUDGE_STEP', id: 'a', frames: 60 });

    expect(next.steps.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(isAscending(next.steps)).toBe(true);
  });

  it('自動検出のステップを手動・信頼度 1 へ昇格させる', () => {
    const { next } = chartReducer(BASE, { type: 'NUDGE_STEP', id: 'a', frames: 1 });
    const moved = next.steps.find((s) => s.id === 'a');

    expect(moved).toMatchObject({ origin: 'manual', confidence: 1 });
  });

  it('検出器の由来は履歴として残す', () => {
    const { next } = chartReducer(BASE, { type: 'NUDGE_STEP', id: 'a', frames: 1 });

    expect(next.steps.find((s) => s.id === 'a')?.detector).toBe('ammo');
  });

  it('時刻が負になる移動は拒否する', () => {
    const state = stateOf([step({ id: 'a', tMs: 10 })]);
    const outcome = chartReducer(state, { type: 'NUDGE_STEP', id: 'a', frames: -2 });

    expect(outcome.next).toBe(state);
    expect(outcome.inverse).toBeNull();
  });

  it('0 コマや存在しない id は何もしない', () => {
    expect(chartReducer(BASE, { type: 'NUDGE_STEP', id: 'a', frames: 0 }).inverse).toBeNull();
    expect(chartReducer(BASE, { type: 'NUDGE_STEP', id: 'zzz', frames: 1 }).inverse).toBeNull();
  });

  it('逆操作で昇格前の origin と confidence まで戻る', () => {
    const { next, inverse } = chartReducer(BASE, { type: 'NUDGE_STEP', id: 'a', frames: 3 });

    expect(chartReducer(next, inverse as EditorAction).next.steps).toEqual(BASE.steps);
  });
});

describe('chartReducer / CHANGE_INPUT', () => {
  it('時刻を保ったまま入力種別を変える', () => {
    const { next } = chartReducer(BASE, { type: 'CHANGE_INPUT', id: 'a', input: 'jump' });

    expect(next.steps[0]).toMatchObject({ tMs: 1000, input: 'jump' });
  });

  it('自動検出のステップを手動・信頼度 1 へ昇格させる', () => {
    const { next } = chartReducer(BASE, { type: 'CHANGE_INPUT', id: 'a', input: 'jump' });

    expect(next.steps[0]).toMatchObject({ origin: 'manual', confidence: 1 });
  });

  it('既存の入力種別でない値は受け付けない', () => {
    const outcome = chartReducer(BASE, {
      type: 'CHANGE_INPUT',
      id: 'a',
      input: 'ultra' as ButtonType,
    });

    expect(outcome.next).toBe(BASE);
    expect(outcome.inverse).toBeNull();
  });

  it('同じ種別への変更は何もしない', () => {
    const outcome = chartReducer(BASE, { type: 'CHANGE_INPUT', id: 'a', input: 'shot' });

    expect(outcome.next).toBe(BASE);
    expect(outcome.inverse).toBeNull();
  });

  it('逆操作で昇格前の状態へ戻る', () => {
    const { next, inverse } = chartReducer(BASE, { type: 'CHANGE_INPUT', id: 'a', input: 'jump' });

    expect(chartReducer(next, inverse as EditorAction).next.steps).toEqual(BASE.steps);
  });
});

describe('chartReducer / APPLY_GLOBAL_OFFSET', () => {
  it('全件へ同一値を加算して相対順序を保つ', () => {
    const { next } = chartReducer(BASE, { type: 'APPLY_GLOBAL_OFFSET', offsetMs: 500 });

    expect(next.steps.map((s) => s.tMs)).toEqual([1500, 2500, 3500]);
    expect(next.steps.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('負方向のオフセットも相対順序を保つ', () => {
    const { next } = chartReducer(BASE, { type: 'APPLY_GLOBAL_OFFSET', offsetMs: -1000 });

    expect(next.steps.map((s) => s.tMs)).toEqual([0, 1000, 2000]);
  });

  it('時刻が負になる場合は適用自体を拒否し、切り詰めない', () => {
    const outcome = chartReducer(BASE, { type: 'APPLY_GLOBAL_OFFSET', offsetMs: -1500 });

    expect(outcome.next).toBe(BASE);
    expect(outcome.inverse).toBeNull();
  });

  it('オフセットは origin や confidence を変えない', () => {
    const { next } = chartReducer(BASE, { type: 'APPLY_GLOBAL_OFFSET', offsetMs: 500 });

    expect(next.steps[0]).toMatchObject({ origin: 'auto', confidence: 0.9 });
  });

  it('0 や対象なしは何もしない', () => {
    expect(chartReducer(BASE, { type: 'APPLY_GLOBAL_OFFSET', offsetMs: 0 }).inverse).toBeNull();
    expect(
      chartReducer(stateOf([]), { type: 'APPLY_GLOBAL_OFFSET', offsetMs: 500 }).inverse,
    ).toBeNull();
  });

  it('逆操作で元の時刻へ戻る', () => {
    const { next, inverse } = chartReducer(BASE, { type: 'APPLY_GLOBAL_OFFSET', offsetMs: 777 });

    expect(chartReducer(next, inverse as EditorAction).next.steps).toEqual(BASE.steps);
  });
});

describe('chartReducer / ADOPT_DETECTIONS', () => {
  const DETECTIONS: readonly DetectedStep[] = [
    detected({ tMs: 1200, input: 'shot', detector: 'ammo', confidence: 0.95 }),
    detected({ tMs: 2500, input: 'bd', detector: 'boost', confidence: 0.4, caveat: 'across_gap' }),
  ];

  it('replace_auto_only は手動ステップを一切削除しない', () => {
    const { next } = chartReducer(BASE, {
      type: 'ADOPT_DETECTIONS',
      steps: DETECTIONS,
      strategy: 'replace_auto_only',
    });

    expect(next.steps.find((s) => s.id === 'b')).toEqual(MANUAL_B);
  });

  it('replace_auto_only は自動検出のステップだけを差し替える', () => {
    const { next } = chartReducer(BASE, {
      type: 'ADOPT_DETECTIONS',
      steps: DETECTIONS,
      strategy: 'replace_auto_only',
    });

    expect(next.steps.map((s) => s.tMs)).toEqual([1200, 2000, 2500]);
    expect(next.steps.some((s) => s.id === 'a' || s.id === 'c')).toBe(false);
  });

  it('discard_all は手動を含むすべてを検出結果で置き換える', () => {
    const { next } = chartReducer(BASE, {
      type: 'ADOPT_DETECTIONS',
      steps: DETECTIONS,
      strategy: 'discard_all',
    });

    expect(next.steps.map((s) => s.tMs)).toEqual([1200, 2500]);
    expect(next.steps.every((s) => s.origin === 'auto')).toBe(true);
  });

  it('検出結果に origin auto と検出器・要確認理由を持たせる', () => {
    const { next } = chartReducer(stateOf([]), {
      type: 'ADOPT_DETECTIONS',
      steps: DETECTIONS,
      strategy: 'discard_all',
    });

    expect(next.steps[1]).toMatchObject({
      tMs: 2500,
      input: 'bd',
      origin: 'auto',
      confidence: 0.4,
      detector: 'boost',
      caveat: 'across_gap',
    });
    expect(new Set(next.steps.map((s) => s.id)).size).toBe(2);
  });

  it('取り込み後も時刻の昇順を保つ', () => {
    const { next } = chartReducer(BASE, {
      type: 'ADOPT_DETECTIONS',
      steps: [detected({ tMs: 5000 }), detected({ tMs: 100 })],
      strategy: 'replace_auto_only',
    });

    expect(isAscending(next.steps)).toBe(true);
  });

  it('消えたステップを選択していたら選択を外す', () => {
    const { next } = chartReducer(stateOf(BASE.steps, 'a'), {
      type: 'ADOPT_DETECTIONS',
      steps: DETECTIONS,
      strategy: 'replace_auto_only',
    });

    expect(next.selectedId).toBeNull();
  });

  it('逆操作で取り込み前の状態へ戻る', () => {
    const { next, inverse } = chartReducer(BASE, {
      type: 'ADOPT_DETECTIONS',
      steps: DETECTIONS,
      strategy: 'discard_all',
    });

    expect(chartReducer(next, inverse as EditorAction).next.steps).toEqual(BASE.steps);
  });
});

describe('chartReducer / REPLACE_ALL', () => {
  it('渡された列を時刻昇順に整えて置き換える', () => {
    const { next } = chartReducer(BASE, {
      type: 'REPLACE_ALL',
      steps: [step({ id: 'x', tMs: 900 }), step({ id: 'y', tMs: 100 })],
    });

    expect(next.steps.map((s) => s.id)).toEqual(['y', 'x']);
  });

  it('残っていない選択は外し、残っていれば保つ', () => {
    const kept = chartReducer(stateOf(BASE.steps, 'b'), {
      type: 'REPLACE_ALL',
      steps: [MANUAL_B],
    });
    const dropped = chartReducer(stateOf(BASE.steps, 'a'), {
      type: 'REPLACE_ALL',
      steps: [MANUAL_B],
    });

    expect(kept.next.selectedId).toBe('b');
    expect(dropped.next.selectedId).toBeNull();
  });
});

describe('chartReducer / Undo の性質', () => {
  /** テストを再現可能にするための決定的な擬似乱数 */
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  const INPUTS: readonly ButtonType[] = ['shot', 'melee', 'jump', 'bd', 'sub', 'special-shot'];

  function randomAction(state: EditorState, rand: () => number): EditorAction {
    const pick = Math.floor(rand() * 7);
    const ids = state.steps.map((s) => s.id);
    const id = ids.length > 0 ? ids[Math.floor(rand() * ids.length)] : 'missing';
    const input = INPUTS[Math.floor(rand() * INPUTS.length)];

    switch (pick) {
      case 0:
        return { type: 'ADD_STEP', tMs: Math.floor(rand() * 10000), input };
      case 1:
        return { type: 'REMOVE_STEP', id };
      case 2:
        return { type: 'NUDGE_STEP', id, frames: Math.floor(rand() * 9) - 4 };
      case 3:
        return { type: 'CHANGE_INPUT', id, input };
      case 4:
        return { type: 'APPLY_GLOBAL_OFFSET', offsetMs: Math.floor(rand() * 2000) - 1000 };
      case 5:
        return {
          type: 'ADOPT_DETECTIONS',
          steps: [detected({ tMs: Math.floor(rand() * 10000), input })],
          strategy: rand() < 0.5 ? 'replace_auto_only' : 'discard_all',
        };
      default:
        return { type: 'REPLACE_ALL', steps: state.steps.slice(0, 1) };
    }
  }

  it.each([1, 7, 42, 1234, 99991])(
    '任意の操作列を適用してからすべて打ち消すと初期状態に戻る (seed %i)',
    (seed) => {
      const rand = lcg(seed);
      const initial = BASE;
      let state = initial;
      const inverses: EditorAction[] = [];

      for (let i = 0; i < 40; i += 1) {
        const outcome = chartReducer(state, randomAction(state, rand));
        expect(isAscending(outcome.next.steps)).toBe(true);
        state = outcome.next;
        if (outcome.inverse !== null) inverses.push(outcome.inverse);
      }

      for (const inverse of inverses.reverse()) {
        state = chartReducer(state, inverse).next;
      }

      expect(state).toEqual(initial);
    },
  );

  it('手動ステップは差し替えを繰り返しても消えない', () => {
    const rand = lcg(2024);
    let state = BASE;

    for (let i = 0; i < 30; i += 1) {
      state = chartReducer(state, {
        type: 'ADOPT_DETECTIONS',
        steps: [detected({ tMs: Math.floor(rand() * 10000) })],
        strategy: 'replace_auto_only',
      }).next;
    }

    expect(state.steps.find((s) => s.id === 'b')).toEqual(MANUAL_B);
  });
});
