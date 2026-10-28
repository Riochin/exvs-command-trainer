import { describe, it, expect } from 'vitest';
import {
  CHART_CSV_COLUMNS,
  serializeChartCsv,
} from '@/features/chart-author/io/csvCodec';
import { toChart } from '@/features/chart-author/io/chartCodec';
import { CHART_FORMAT_VERSION } from '@/types/chart';
import type { Chart, ChartSource } from '@/types/chart';
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

const CHART: Chart = toChart(
  [
    editorStep({ id: 'a', tMs: 1000, input: 'shot', confidence: 0.95, origin: 'auto' }),
    editorStep({ id: 'b', tMs: 2000, input: 'bd', confidence: 0.4, origin: 'manual' }),
    editorStep({
      id: 'c',
      tMs: 3000,
      input: 'shot-charge-start',
      confidence: 0.85,
      origin: 'auto',
    }),
  ],
  SOURCE,
);

/** 末尾の改行を除いた行の配列 */
function linesOf(csv: string): string[] {
  return csv.replace(/\n$/, '').split('\n');
}

describe('serializeChartCsv', () => {
  it('列は譜面のステップが持つ項目と同一', () => {
    const [header] = linesOf(serializeChartCsv(CHART));
    expect(header.split(',')).toEqual(['tMs', 'input', 'confidence', 'origin']);
    expect(CHART_CSV_COLUMNS).toEqual(['tMs', 'input', 'confidence', 'origin']);
  });

  it('列の定義は譜面のステップの項目から外れない', () => {
    const stepKeys = Object.keys(CHART.steps[0]).sort();
    expect([...CHART_CSV_COLUMNS].sort()).toEqual(stepKeys);
  });

  it('行数はステップ数と見出し 1 行の合計になる', () => {
    expect(linesOf(serializeChartCsv(CHART))).toHaveLength(CHART.steps.length + 1);
  });

  it('1 ステップ 1 行で値を出力する', () => {
    const [, first, second] = linesOf(serializeChartCsv(CHART));
    expect(first).toBe('1000,shot,0.95,auto');
    expect(second).toBe('2000,bd,0.4,manual');
  });

  it('ステップの順序を保つ', () => {
    const times = linesOf(serializeChartCsv(CHART))
      .slice(1)
      .map((line) => Number(line.split(',')[0]));
    expect(times).toEqual(CHART.steps.map((s) => s.tMs));
  });

  it('ステップが無い譜面でも見出し行だけを出力する', () => {
    const empty: Chart = { version: CHART_FORMAT_VERSION, source: SOURCE, steps: [] };
    expect(linesOf(serializeChartCsv(empty))).toEqual(['tMs,input,confidence,origin']);
  });

  it('末尾を改行で終える', () => {
    expect(serializeChartCsv(CHART).endsWith('\n')).toBe(true);
  });
});
