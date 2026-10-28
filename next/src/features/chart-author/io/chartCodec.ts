/**
 * 譜面 JSON の組み立て・直列化・読み込み変換。
 *
 * 純関数のみ。ファイルや DOM の都合は `useChartIo` が引き受ける。
 * 検証そのものは共有型 `@/types/chart` の `parseChart` が所有しており、
 * ここはそれを通す導線を提供するだけで、独自の緩い検証を作らない。
 */
import { isButtonType } from '@/types';
import { CHART_FORMAT_VERSION, parseChart } from '@/types/chart';
import type { Chart, ChartSource, ChartStep } from '@/types/chart';
import type { EditorStep } from '../types';

export { parseChart };
export type { ChartParseError, ChartParseResult } from '@/types/chart';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 編集中のステップ列と出典から譜面を組み立てる。
 *
 * 編集専用の情報（識別子・検出器の由来・確認理由）はここで落とす。
 * 併せて、型検査をすり抜けた値（壊れた下書きの復元など）に対する最後の砦として
 * 入力種別と数値の範囲を見る。読み戻せないファイルを書き出さないための担保。
 */
export function toChart(steps: readonly EditorStep[], source: ChartSource): Chart {
  const normalized: ChartStep[] = steps
    .filter((step) => isButtonType(step.input))
    .map((step) => ({
      tMs: clamp(step.tMs, 0, Number.MAX_SAFE_INTEGER),
      input: step.input,
      confidence: clamp(step.confidence, 0, 1),
      origin: step.origin,
    }))
    .sort((a, b) => a.tMs - b.tMs);

  return { version: CHART_FORMAT_VERSION, source, steps: normalized };
}

/** 譜面を JSON 文字列にする。ダウンロードして人が開くため整形して書く */
export function serializeChart(chart: Chart): string {
  return `${JSON.stringify(chart, null, 2)}\n`;
}

/**
 * 検証を通った譜面を編集用のステップ列へ変換する。
 * 識別子は新規に採番し、検出器由来の情報は持たせない（読み込んだ時点で
 * どの検出器が出したかは失われており、手がかりを捏造しないため）。
 */
export function toEditorSteps(chart: Chart): readonly EditorStep[] {
  return chart.steps.map((step) => ({
    ...step,
    id: crypto.randomUUID(),
    detector: null,
    caveat: 'none' as const,
  }));
}
