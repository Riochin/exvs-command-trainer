/**
 * 譜面の CSV 直列化。
 *
 * 表計算ソフトで開いて眺めるための出力であり、読み戻す先は JSON の方。
 * 列は譜面のステップが持つ項目そのものにし、CSV 専用の列を足さない
 * （JSON と CSV で内容が食い違うと、どちらが正かが分からなくなるため）。
 */
import type { Chart, ChartStep } from '@/types/chart';

/** CSV の列。譜面のステップの項目から外れないよう型で縛る */
export const CHART_CSV_COLUMNS = [
  'tMs',
  'input',
  'confidence',
  'origin',
] as const satisfies readonly (keyof ChartStep)[];

/**
 * 1 ステップ 1 行の CSV を返す。先頭は見出し行。
 * 値は数値と固定の識別子（ButtonType / origin）に限られ、区切り文字や
 * 引用符を含み得ないため、引用は行わない。
 */
export function serializeChartCsv(chart: Chart): string {
  const rows = chart.steps.map((step) =>
    CHART_CSV_COLUMNS.map((column) => String(step[column])).join(','),
  );
  return [CHART_CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}
