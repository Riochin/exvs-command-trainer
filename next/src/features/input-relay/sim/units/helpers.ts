import type { ActionDef } from '../actions';

/**
 * 機体データを書くときの共通の部品。
 */

/** 射撃・格闘のあとにまず入れるキャンセル先（BD とステップ） */
export const BOOST_STEP = ['bd', 'step'] as const;

/**
 * 技の id に機体ごとの接頭辞を付ける関数を作る。
 * キャンセルルート（`cancels.into`）にはこの接頭辞付きの id を書く。
 *
 * @example
 * const act = actionMaker('rouge');
 * act('sub-n', 'Nサブ ビームランチャー', { ... }); // id は 'rouge-sub-n'
 */
export function actionMaker(prefix: string) {
  return (id: string, label: string, def: Omit<ActionDef, 'id' | 'label'>): ActionDef & { id: string } => ({
    id: `${prefix}-${id}`,
    label,
    ...def,
  });
}
