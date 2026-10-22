/**
 * 入力の表示名。フィーチャーを跨いで参照しない方針（steering: structure.md）に従い、
 * chart-author の対応表とは別にここで持つ。
 */
import type { ArcadeRawInputPhase } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';

const INPUT_LABELS: Readonly<Record<ButtonType, string>> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャンプ',
  bd: 'BD',
  awaken: '覚醒',
  'shot-charge-start': '射CS開始',
  'shot-charge-end': '射CS終わり',
  'melee-charge-start': '格CS開始',
  'melee-charge-end': '格CS終わり',
  sub: 'サブ',
  'special-shot': '特射',
  'special-melee': '特格',
};

const PHASE_LABELS: Readonly<Record<ArcadeRawInputPhase, string>> = {
  down: '押',
  up: '離',
  cancel: '中断',
};

export function inputLabel(button: ButtonType): string {
  return INPUT_LABELS[button];
}

export function phaseLabel(phase: ArcadeRawInputPhase): string {
  return PHASE_LABELS[phase];
}
