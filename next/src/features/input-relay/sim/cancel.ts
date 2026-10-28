import type { ActionDef } from './actions';
import type { MechAction, MechState } from './types';

/**
 * キャンセルルート（EXVS の一般的な機体に寄せたもの）。
 *
 * 行動ごとに「どの行動で上書きできるか」と「いつから受け付けるか」を持つ。
 * - 射撃系は弾が出たあと（硬直中）から、BD・サブ・特射・特格・射CS などでキャンセルできる
 * - 格闘は攻撃が出たあとから、格闘の追加入力（2・3 段目）や BD・サブ・特射・特格でキャンセルできる
 * - BD・ジャンプ中はいつでも何でも出せる
 * - 射撃から射撃、射撃から格闘は直接つながらない（ズンダは BD かステップを挟む）
 * - ステップは射撃・格闘のどちらからでも出せる（ステキャン）。ステップ中は何でも出せる
 */
export type CancelRule = {
  into: ReadonlyArray<MechAction>;
  /** always: 行動の最初から / afterFire: 弾や攻撃が出たあとから */
  opens: 'always' | 'afterFire';
  /** afterFire でも、弾が出る前から出せる行動（移動撃ちの BR からのステップなど） */
  early?: ReadonlyArray<MechAction>;
};

const EVERYTHING: ReadonlyArray<MechAction> = [
  'shot',
  'melee',
  'jump',
  'bd',
  'step',
  'sub',
  'special-shot',
  'special-melee',
  'shot-cs',
  'melee-cs',
];

export const CANCEL_RULES: Readonly<Record<MechAction, CancelRule>> = {
  // 移動撃ちの BR は撃ちながらステップできる（動き撃ちステップ）
  shot: { into: ['bd', 'step', 'sub', 'special-shot', 'special-melee', 'shot-cs'], opens: 'afterFire', early: ['step'] },
  // サブ（アシスト）→ BR はアメキャン（自由落下に移る）
  sub: { into: ['bd', 'step', 'special-melee', 'shot'], opens: 'afterFire' },
  'special-shot': { into: ['bd', 'step'], opens: 'afterFire' },
  'shot-cs': { into: ['bd', 'step', 'sub'], opens: 'afterFire' },
  melee: { into: ['melee', 'bd', 'step', 'sub', 'special-shot', 'special-melee'], opens: 'afterFire' },
  'special-melee': { into: ['bd', 'step', 'melee'], opens: 'afterFire' },
  'melee-cs': { into: ['bd', 'step', 'melee'], opens: 'afterFire' },
  jump: { into: EVERYTHING, opens: 'always' },
  bd: { into: EVERYTHING, opens: 'always' },
  step: { into: EVERYTHING, opens: 'always' },
};

export const MELEE_MAX_STAGE = 3;

/** 受付前に来た入力を、何秒前のものまで出すか */
export const INPUT_BUFFER_S = 0.25;

/**
 * 今の行動から next を出せるか。
 * - free: 行動していない
 * - open: キャンセルできる
 * - notYet: キャンセルできる組み合わせだが、まだ受付前
 * - closed: この組み合わせではキャンセルできない
 *
 * nextMove を渡すと、技ごとのキャンセルルート（技の id で書かれたもの）も見る。
 * 今の技が独自のルートを持っていればスロットの標準ルートの代わりに使う。
 */
export type CancelState = 'free' | 'open' | 'notYet' | 'closed';

export function cancelState(mech: MechState, next: MechAction, nextMove?: ActionDef | null): CancelState {
  if (mech.action === 'idle') return 'free';
  const rule = mech.move?.cancels ?? CANCEL_RULES[mech.action];
  const nextId = nextMove?.id;
  const listed = (list: ReadonlyArray<string> | undefined) =>
    list !== undefined && (list.includes(next) || (nextId !== undefined && list.includes(nextId)));
  if (!listed(rule.into)) return 'closed';
  // 同じ格闘の追加入力は、その技の段数まで
  const sameMove = nextId !== undefined && nextId === mech.move?.id;
  if ((next === 'melee' || next === 'special-melee') && next === mech.action && (sameMove || nextMove == null)) {
    if (mech.meleeStage >= (mech.move?.comboMax ?? MELEE_MAX_STAGE)) return 'closed';
  }
  if (rule.opens === 'afterFire' && !mech.actionFired) {
    // 振り向き撃ちは足が止まるので、撃つ前のステップはできない
    if (listed(rule.early) && !mech.turnShot) return 'open';
    return 'notYet';
  }
  return 'open';
}

const CANCEL_NAMES: Partial<Record<MechAction, string>> = {
  bd: 'BDC',
  step: 'ステキャン',
  sub: 'サブC',
  'special-shot': '特射C',
  'special-melee': '特格C',
  'shot-cs': 'CSC',
};

/**
 * つないだ行動の並びからルート名を決める。名前を付けるほどでなければ null。
 * chain の末尾が今出した行動。
 */
export function routeName(chain: ReadonlyArray<MechAction>, meleeStage: number, canceled: boolean): string | null {
  const last = chain[chain.length - 1];
  if (last === undefined) return null;

  // 射撃 → BD（ステップ）→ 射撃 …… の繰り返し。つなぎが全部ステップならステズンダ
  if (last === 'shot') {
    let shots = 1;
    let allSteps = true;
    for (let i = chain.length - 2; i >= 1 && (chain[i] === 'bd' || chain[i] === 'step') && chain[i - 1] === 'shot'; i -= 2) {
      shots++;
      if (chain[i] !== 'step') allSteps = false;
    }
    if (shots >= 2) {
      const name = allSteps ? 'ステズンダ' : 'ズンダ';
      return shots === 2 ? name : `${name} ${shots}発`;
    }
  }

  if (last === 'melee' && meleeStage >= 2) return `格闘 ${meleeStage}段目`;
  if (!canceled) return null;
  return CANCEL_NAMES[last] ?? null;
}
