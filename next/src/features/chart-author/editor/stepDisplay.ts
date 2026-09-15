/**
 * ステップを人に見せるときの語彙と、候補かどうかの判定。
 *
 * 一覧とタイムラインは「同じステップを同じ色で」示す必要がある（Req 4.4）。
 * 判定を各画面に書くと片方だけ直して食い違うので、規則はここが持つ。
 */
import type { ChartStepOrigin } from '@/types/chart';
import type { EditorStep } from '../types';

export const ORIGIN_LABELS: Readonly<Record<ChartStepOrigin, string>> = {
  auto: '自動',
  manual: '手動',
};

/** 表示順を固定した由来の一覧。絞り込みの選択肢に使う */
export const ORIGINS: readonly ChartStepOrigin[] = ['auto', 'manual'];

/** 確認を要する理由の説明。候補に添えて、何を見ればよいかを伝える */
export const CAVEAT_LABELS: Readonly<Record<EditorStep['caveat'], string>> = {
  none: '',
  direction_unknown: '弾数の増減が未確定',
  across_gap: '欠測区間をまたぐ変化',
  low_margin: '判定の余裕が小さい',
};

/**
 * 目視確認を要する候補か。
 *
 * ブースト由来は原理的に取りこぼしと誤検出が多く（Req 4.4）、
 * 理由付きのステップは検出器自身が確信を持てなかったもの。
 */
export function isCandidateStep(step: EditorStep): boolean {
  return step.detector === 'boost' || step.caveat !== 'none';
}

/** 候補である理由。候補でなければ null */
export function candidateReason(step: EditorStep): string | null {
  if (step.caveat !== 'none') return CAVEAT_LABELS[step.caveat];
  if (step.detector === 'boost') return 'ブースト由来の候補';
  return null;
}
