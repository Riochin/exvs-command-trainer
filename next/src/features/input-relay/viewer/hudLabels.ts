/**
 * 画面中央に出す出来事（ルート名・出せなかった理由）を絞る許可リスト。
 *
 * sim は細かい出来事をすべて出すが、HUD には練習で意識したいものだけを出す。
 * 新しい機体が独自の名前を出しても、ここに足すまでは表示しない。
 */
import type { SimEvent } from '../sim/types';

/** 出すルート名。値は表示名 */
const ROUTE_LABELS: ReadonlyMap<string, string> = new Map([
  ['慣性ジャンプ', '慣性ジャンプ'],
  ['慣性ジャンプ（入れっぱ）', '慣性ジャンプ（入れっぱ）'],
  ['振り向き撃ち', '振り向き撃ち'],
  ['アメキャン', 'アメキャン'],
  ['ステBD', 'ステBD'],
  ['SEED発現', '換装'],
  // 盾を出しただけ（「盾」）や先行入力盾は出さず、防げたときだけ出す
  ['盾成立', '盾成立'],
]);

/** BD を挟んだズンダ（「ズンダ」「ズンダ 3発」）。ステップだけのステズンダは出さない */
const ZUNDA = /^ズンダ( \d+発)?$/;

const REJECT_LABELS: ReadonlySet<string> = new Set(['キャンセル不可', '着地硬直', 'OVERHEAT', '弾切れ', 'チャージ不足']);

/** HUD に出す表示名。出さない出来事なら null */
export function hudLabel(event: SimEvent): string | null {
  if (event.kind === 'reject') return REJECT_LABELS.has(event.label) ? event.label : null;
  if (ZUNDA.test(event.label)) return event.label;
  return ROUTE_LABELS.get(event.label) ?? null;
}
