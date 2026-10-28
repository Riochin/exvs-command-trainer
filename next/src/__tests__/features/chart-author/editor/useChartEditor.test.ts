import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useChartEditor } from '@/features/chart-author/editor/useChartEditor';
import {
  CHART_AUTHOR_DRAFT_VERSION,
  DRAFT_AUTOSAVE_DELAY_MS,
  DRAFT_STORAGE_KEY,
  FRAME_DURATION_MS,
  UNDO_LIMIT,
} from '@/features/chart-author/constants';
import type {
  ChartAuthorDraft,
  DetectedStep,
  EditorStep,
  VideoKey,
} from '@/features/chart-author/types';
import type { ChartSource } from '@/types/chart';

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

const STEPS: readonly EditorStep[] = [
  step({ id: 'a', tMs: 1000, input: 'shot', confidence: 0.95 }),
  step({ id: 'b', tMs: 2000, input: 'melee', origin: 'manual', confidence: 1, detector: null }),
  step({ id: 'c', tMs: 5000, input: 'bd', confidence: 0.4, detector: 'boost' }),
];

const VIDEO_KEY: VideoKey = {
  fileName: 'match.mp4',
  durationMs: 60000,
  width: 1920,
  height: 1080,
};

const SOURCE: ChartSource = { type: 'file', fileName: 'match.mp4', offsetMs: 0 };

function setup(initialSteps: readonly EditorStep[] = STEPS) {
  return renderHook(() =>
    useChartEditor({ initialSteps, videoKey: VIDEO_KEY, source: SOURCE }),
  );
}

/** debounce を越えるまで時間を進める */
function flushAutoSave(): void {
  act(() => {
    vi.advanceTimersByTime(DRAFT_AUTOSAVE_DELAY_MS);
  });
}

function savedDraft(): ChartAuthorDraft | null {
  const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as ChartAuthorDraft);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useChartEditor / 編集操作', () => {
  it('初期ステップを時刻順に持つ', () => {
    const { result } = setup();

    expect(result.current.steps.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('現在位置へ手動ステップを追加する', () => {
    const { result } = setup();

    act(() => result.current.addStep(1500, 'jump'));

    expect(result.current.steps.map((s) => s.tMs)).toEqual([1000, 1500, 2000, 5000]);
    expect(result.current.steps[1]).toMatchObject({ origin: 'manual', confidence: 1 });
  });

  it('削除・時刻調整・種別変更を反映する', () => {
    const { result } = setup();

    act(() => result.current.removeStep('c'));
    act(() => result.current.nudgeStep('a', 2));
    act(() => result.current.changeStepInput('b', 'sub'));

    expect(result.current.steps.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result.current.steps[0].tMs).toBeCloseTo(1000 + 2 * FRAME_DURATION_MS, 6);
    expect(result.current.steps[1].input).toBe('sub');
  });

  it('全体オフセットを適用する', () => {
    const { result } = setup();

    act(() => result.current.applyGlobalOffset(500));

    expect(result.current.steps.map((s) => s.tMs)).toEqual([1500, 2500, 5500]);
  });

  it('検出結果を取り込んでも手動ステップを残す', () => {
    const { result } = setup();
    const detections: readonly DetectedStep[] = [
      { tMs: 3000, input: 'shot', confidence: 0.9, detector: 'ammo', caveat: 'none' },
    ];

    act(() => result.current.adoptDetections(detections, 'replace_auto_only'));

    expect(result.current.steps.map((s) => s.tMs)).toEqual([2000, 3000]);
  });

  it('全置換ができる', () => {
    const { result } = setup();

    act(() => result.current.replaceAll([step({ id: 'z', tMs: 10 })]));

    expect(result.current.steps.map((s) => s.id)).toEqual(['z']);
  });

  it('選択を設定でき、選択中のステップを消すと選択が外れる', () => {
    const { result } = setup();

    act(() => result.current.select('b'));
    expect(result.current.selectedId).toBe('b');

    act(() => result.current.removeStep('b'));
    expect(result.current.selectedId).toBeNull();
  });
});

describe('useChartEditor / Undo', () => {
  it('操作前は Undo できない', () => {
    const { result } = setup();

    expect(result.current.canUndo).toBe(false);
  });

  it('直前の操作を打ち消す', () => {
    const { result } = setup();

    act(() => result.current.removeStep('b'));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());

    expect(result.current.steps).toEqual(STEPS);
    expect(result.current.canUndo).toBe(false);
  });

  it('何も変えない操作は Undo の履歴を消費しない', () => {
    const { result } = setup();

    act(() => result.current.removeStep('存在しない'));
    act(() => result.current.changeStepInput('a', 'shot'));

    expect(result.current.canUndo).toBe(false);
  });

  it('打ち消せるのは直近 20 件で、古い操作は捨てられる', () => {
    const { result } = setup([]);

    for (let i = 0; i < UNDO_LIMIT + 1; i += 1) {
      act(() => result.current.addStep(i * 100, 'shot'));
    }
    expect(result.current.steps).toHaveLength(UNDO_LIMIT + 1);

    for (let i = 0; i < UNDO_LIMIT; i += 1) {
      act(() => result.current.undo());
    }

    // 最初の 1 件は上限を超えて捨てられたので、もう打ち消せない
    expect(result.current.canUndo).toBe(false);
    expect(result.current.steps.map((s) => s.tMs)).toEqual([0]);
  });

  it('履歴が空のときの undo は何もしない', () => {
    const { result } = setup();

    act(() => result.current.undo());

    expect(result.current.steps).toEqual(STEPS);
  });

  it('Undo 自体は履歴に積まれない', () => {
    const { result } = setup();

    act(() => result.current.removeStep('a'));
    act(() => result.current.undo());
    act(() => result.current.undo());

    expect(result.current.steps).toEqual(STEPS);
  });
});

describe('useChartEditor / 絞り込み', () => {
  it('既定ではすべて表示する', () => {
    const { result } = setup();

    expect(result.current.visibleSteps).toEqual(result.current.steps);
    expect(result.current.filter).toEqual({ inputs: null, origins: null, minConfidence: 0 });
  });

  it('入力種別で絞り込む', () => {
    const { result } = setup();

    act(() => result.current.setFilter({ inputs: ['shot', 'bd'], origins: null, minConfidence: 0 }));

    expect(result.current.visibleSteps.map((s) => s.id)).toEqual(['a', 'c']);
    expect(result.current.steps).toHaveLength(3);
  });

  it('由来で絞り込む', () => {
    const { result } = setup();

    act(() => result.current.setFilter({ inputs: null, origins: ['manual'], minConfidence: 0 }));

    expect(result.current.visibleSteps.map((s) => s.id)).toEqual(['b']);
  });

  it('最小信頼度で絞り込む', () => {
    const { result } = setup();

    act(() => result.current.setFilter({ inputs: null, origins: null, minConfidence: 0.9 }));

    expect(result.current.visibleSteps.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('複数の条件は同時に効く', () => {
    const { result } = setup();

    act(() =>
      result.current.setFilter({ inputs: ['shot'], origins: ['auto'], minConfidence: 0.5 }),
    );

    expect(result.current.visibleSteps.map((s) => s.id)).toEqual(['a']);
  });

  it('編集後も絞り込みが効き続ける', () => {
    const { result } = setup();

    act(() => result.current.setFilter({ inputs: null, origins: ['manual'], minConfidence: 0 }));
    act(() => result.current.addStep(100, 'jump'));

    expect(result.current.visibleSteps.map((s) => s.tMs)).toEqual([100, 2000]);
  });
});

describe('useChartEditor / 再生位置に最も近いステップ', () => {
  it('最も近いステップを返す', () => {
    const { result } = setup();

    expect(result.current.findNearestStep(1900)?.id).toBe('b');
    expect(result.current.findNearestStep(0)?.id).toBe('a');
    expect(result.current.findNearestStep(99999)?.id).toBe('c');
  });

  it('等距離なら手前のステップを返す', () => {
    const { result } = setup();

    expect(result.current.findNearestStep(1500)?.id).toBe('a');
  });

  it('ステップがなければ null を返す', () => {
    const { result } = setup([]);

    expect(result.current.findNearestStep(1000)).toBeNull();
  });

  it('絞り込みで隠れたステップは対象にしない', () => {
    const { result } = setup();

    act(() => result.current.setFilter({ inputs: null, origins: ['manual'], minConfidence: 0 }));

    expect(result.current.findNearestStep(1000)?.id).toBe('b');
  });
});

describe('useChartEditor / 自動保存', () => {
  it('編集がなければ保存しない', () => {
    setup();
    flushAutoSave();

    expect(savedDraft()).toBeNull();
  });

  it('編集内容を debounce してから保存する', () => {
    const { result } = setup();

    act(() => result.current.addStep(1500, 'jump'));
    expect(savedDraft()).toBeNull();

    flushAutoSave();

    const draft = savedDraft();
    expect(draft?.version).toBe(CHART_AUTHOR_DRAFT_VERSION);
    expect(draft?.steps.map((s) => s.tMs)).toEqual([1000, 1500, 2000, 5000]);
    expect(draft?.videoKey).toEqual(VIDEO_KEY);
    expect(draft?.source).toEqual(SOURCE);
    expect(typeof draft?.savedAt).toBe('string');
  });

  it('連続した編集は最後の 1 回だけ書き込む', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = setup();

    act(() => result.current.addStep(1500, 'jump'));
    act(() => {
      vi.advanceTimersByTime(DRAFT_AUTOSAVE_DELAY_MS - 1);
    });
    act(() => result.current.addStep(1600, 'jump'));
    flushAutoSave();

    expect(setItem.mock.calls.filter(([key]) => key === DRAFT_STORAGE_KEY)).toHaveLength(1);
    expect(savedDraft()?.steps).toHaveLength(5);
  });

  it('Undo の結果も保存する', () => {
    const { result } = setup();

    act(() => result.current.removeStep('a'));
    flushAutoSave();
    act(() => result.current.undo());
    flushAutoSave();

    expect(savedDraft()?.steps.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('容量超過で保存に失敗しても編集は続けられ、呼び出し側へ通知する', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const { result } = setup();

    act(() => result.current.addStep(1500, 'jump'));
    flushAutoSave();

    expect(result.current.lastStorageError).toEqual({
      type: 'quota_exceeded',
      message: 'quota',
    });

    act(() => result.current.addStep(1600, 'jump'));
    expect(result.current.steps).toHaveLength(5);
  });

  it('保存に成功したら直前の失敗通知を消す', () => {
    const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const { result } = setup();

    act(() => result.current.addStep(1500, 'jump'));
    flushAutoSave();
    expect(result.current.lastStorageError).not.toBeNull();

    failing.mockRestore();
    act(() => result.current.addStep(1600, 'jump'));
    flushAutoSave();

    expect(result.current.lastStorageError).toBeNull();
  });

  it('選択の変更だけでは保存しない', () => {
    const { result } = setup();

    act(() => result.current.select('a'));
    flushAutoSave();

    expect(savedDraft()).toBeNull();
  });
});
