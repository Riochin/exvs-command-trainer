import { describe, it, expect } from 'vitest';
import {
  parseChart,
  serializeChart,
  toChart,
  toEditorSteps,
} from '@/features/chart-author/io/chartCodec';
import { CHART_FORMAT_VERSION } from '@/types/chart';
import type { Chart, ChartSource } from '@/types/chart';
import type { ButtonType } from '@/types';
import type { EditorStep } from '@/features/chart-author/types';

const SOURCE: ChartSource = { type: 'file', fileName: 'clip.mp4', offsetMs: 0 };

function editorStep(patch: Partial<EditorStep> = {}): EditorStep {
  return {
    id: 'id-1',
    tMs: 1000,
    input: 'shot',
    confidence: 0.95,
    origin: 'auto',
    detector: 'ammo',
    caveat: 'none',
    ...patch,
  };
}

const STEPS: readonly EditorStep[] = [
  editorStep({ id: 'a', tMs: 1000, input: 'shot' }),
  editorStep({ id: 'b', tMs: 2000, input: 'bd', origin: 'manual', detector: null }),
  editorStep({ id: 'c', tMs: 3000, input: 'shot-charge-start', detector: 'charge' }),
];

describe('toChart', () => {
  it('現行のフォーマットバージョンと与えられた出典を持つ譜面を組み立てる', () => {
    const chart = toChart(STEPS, SOURCE);
    expect(chart.version).toBe(CHART_FORMAT_VERSION);
    expect(chart.source).toEqual(SOURCE);
  });

  it('編集専用の内部情報を出力に含めない', () => {
    const chart = toChart(STEPS, SOURCE);
    for (const step of chart.steps) {
      expect(Object.keys(step).sort()).toEqual(['confidence', 'input', 'origin', 'tMs']);
    }
  });

  it('時刻の昇順に整列する', () => {
    const shuffled = [
      editorStep({ id: 'c', tMs: 3000 }),
      editorStep({ id: 'a', tMs: 1000 }),
      editorStep({ id: 'b', tMs: 2000 }),
    ];
    expect(toChart(shuffled, SOURCE).steps.map((s) => s.tMs)).toEqual([1000, 2000, 3000]);
  });

  it('元のステップ列を変更しない', () => {
    const shuffled = [editorStep({ tMs: 3000 }), editorStep({ tMs: 1000 })];
    toChart(shuffled, SOURCE);
    expect(shuffled.map((s) => s.tMs)).toEqual([3000, 1000]);
  });

  it('妥当でない入力種別のステップは出力しない', () => {
    const broken = [
      editorStep({ id: 'a', tMs: 1000 }),
      editorStep({ id: 'x', tMs: 1500, input: 'teleport' as ButtonType }),
    ];
    expect(toChart(broken, SOURCE).steps.map((s) => s.tMs)).toEqual([1000]);
  });

  it('範囲外の信頼度と負の時刻を範囲内へ収める', () => {
    const odd = [
      editorStep({ id: 'a', tMs: -500, confidence: 1.4 }),
      editorStep({ id: 'b', tMs: 100, confidence: -0.2 }),
    ];
    const chart = toChart(odd, SOURCE);
    expect(chart.steps[0]).toMatchObject({ tMs: 0, confidence: 1 });
    expect(chart.steps[1]).toMatchObject({ tMs: 100, confidence: 0 });
  });

  it('ステップが空でも譜面を組み立てられる', () => {
    expect(toChart([], SOURCE).steps).toEqual([]);
  });

  it('YouTube 出典の動画 ID と時刻補正をそのまま保持する', () => {
    const source: ChartSource = { type: 'youtube', videoId: 'abc123', offsetMs: -250 };
    expect(toChart(STEPS, source).source).toEqual(source);
  });
});

describe('serializeChart / parseChart', () => {
  it('直列化した譜面は必ず読み込みに成功する', () => {
    const chart = toChart(STEPS, SOURCE);
    const result = parseChart(JSON.parse(serializeChart(chart)));
    expect(result.ok).toBe(true);
  });

  it('直列化と読み込みで譜面が一致する', () => {
    const chart = toChart(STEPS, SOURCE);
    const result = parseChart(JSON.parse(serializeChart(chart)));
    expect(result.ok && result.chart).toEqual(chart);
  });

  it('人が読める整形済みの JSON を出力する', () => {
    expect(serializeChart(toChart(STEPS, SOURCE))).toContain('\n');
  });

  it('未知のバージョンは理由付きで拒否する', () => {
    const result = parseChart({ ...toChart(STEPS, SOURCE), version: 99 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toEqual({
      kind: 'unsupported_version',
      found: 99,
    });
  });

  it('妥当でない入力種別を場所付きで列挙し、部分的な取り込みを行わない', () => {
    const chart = toChart(STEPS, SOURCE);
    const broken = {
      ...chart,
      steps: [chart.steps[0], { ...chart.steps[1], input: 'teleport' }, chart.steps[2]],
    };
    const result = parseChart(broken);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toContainEqual({
      kind: 'invalid_button_type',
      path: 'steps[1].input',
      value: 'teleport',
    });
  });

  it('不正な箇所を最初の 1 件で打ち切らずすべて列挙する', () => {
    const chart = toChart(STEPS, SOURCE);
    const broken = {
      ...chart,
      steps: [
        { ...chart.steps[0], input: 'teleport' },
        { ...chart.steps[1], confidence: 5 },
      ],
    };
    const result = parseChart(broken);
    expect(result.ok === false && result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('toEditorSteps', () => {
  it('譜面のステップを編集用のステップへ変換する', () => {
    const chart = toChart(STEPS, SOURCE);
    const restored = toEditorSteps(chart);
    expect(restored.map((s) => [s.tMs, s.input, s.confidence, s.origin])).toEqual(
      chart.steps.map((s) => [s.tMs, s.input, s.confidence, s.origin]),
    );
  });

  it('識別子を新規に採番し、重複させない', () => {
    const restored = toEditorSteps(toChart(STEPS, SOURCE));
    const ids = restored.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('読み込んだステップは検出器の由来を持たない', () => {
    const restored = toEditorSteps(toChart(STEPS, SOURCE));
    expect(restored.every((s) => s.detector === null)).toBe(true);
    expect(restored.every((s) => s.caveat === 'none')).toBe(true);
  });

  it('往復させると識別子以外が一致する', () => {
    const chart = toChart(STEPS, SOURCE);
    const parsed = parseChart(JSON.parse(serializeChart(chart)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const restored = toEditorSteps(parsed.chart);
    const strip = (steps: readonly EditorStep[]) =>
      steps.map(({ id: _id, detector: _detector, ...rest }) => rest);
    expect(strip(restored)).toEqual(
      STEPS.map(({ id: _id, detector: _detector, ...rest }) => rest),
    );
  });

  it('往復させても出典が失われない', () => {
    const source: ChartSource = { type: 'youtube', videoId: 'abc123', offsetMs: 120 };
    const parsed = parseChart(JSON.parse(serializeChart(toChart(STEPS, source))));
    expect(parsed.ok && parsed.chart.source).toEqual(source);
  });

  it('ステップの無い譜面は空のステップ列になる', () => {
    const empty: Chart = { version: CHART_FORMAT_VERSION, source: SOURCE, steps: [] };
    expect(toEditorSteps(empty)).toEqual([]);
  });
});
