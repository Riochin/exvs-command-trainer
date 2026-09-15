/**
 * 入力種別の表示名。
 *
 * ツールの中で種別を人に見せるのはここだけを通す。一覧・集計・編集で
 * 表記が割れると、同じステップが別物に見える。
 *
 * 既存のコマンド編集画面も同種の対応表を持つが、フィーチャーを跨いで
 * 参照し合わない方針（steering: structure.md）に従い、こちらで持つ。
 */
import type { ButtonType } from '@/types';

export const INPUT_LABELS: Readonly<Record<ButtonType, string>> = {
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

/** 未知の値が混ざっても表示を壊さない。値そのものを出して原因を追えるようにする */
export function inputLabel(input: string): string {
  return INPUT_LABELS[input as ButtonType] ?? input;
}

/**
 * 表示順を固定した入力種別の一覧。
 *
 * 絞り込みのチェックボックスも種別変更の選択肢も、並びが揺れると
 * 目で追えなくなる。対応表の定義順をそのまま唯一の並びとして使う。
 */
export const INPUT_TYPES = Object.keys(INPUT_LABELS) as readonly ButtonType[];
