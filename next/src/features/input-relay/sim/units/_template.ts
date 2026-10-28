import { ACTIONS, type ActionDef, type ProjectileSpec } from '../actions';
import type { MechAction } from '../types';
import { actionMaker, BOOST_STEP } from './helpers';
import type { ResolveContext, Rejection, UnitDef } from './types';

/**
 * 新しい機体の雛形。UNITS には登録していない（機体選択に出ない）。
 *
 * 使い方（詳しくは `.kiro/steering/unit-authoring.md`）:
 * 1. このファイルを `units/<機体id>.ts` にコピーし、TEMPLATE / 'tpl' / 'template' を機体名に置き換える
 * 2. wiki の武装表から技（ActionDef）を、キャンセルルート欄から `cancels.into` を書く
 * 3. `units/index.ts` の export と UNITS に足す
 * 4. `__tests__/features/input-relay/sim/units/_template.test.ts` をコピーしてテストを書く
 *
 * 出典: <wiki の機体ページの URL をここに書く>
 */

// ---- 弾（見た目は viewer/Projectiles.tsx の LOOKS。新しい kind はそちらと sim/types.ts に足す） ----

const BEAM: ProjectileSpec = { kind: 'beam', speed: 120, radius: 0.18, life: 1.2, homing: 0.6, count: 1, spread: 0 };
const MISSILE: ProjectileSpec = { kind: 'missile', speed: 45, radius: 0.3, life: 3, homing: 2.5, count: 2, spread: 0.4 };

// 技の id は 'tpl-<名前>' になる。キャンセルルートにはこの id を書く
const act = actionMaker('tpl');

// ---- 射撃系 ----

const S = {
  // 武装表「メイン射撃」。移動撃ち（move: 'free'）、弾が出たあとサブ・特射へキャンセル可
  main: act('main', 'BR', {
    duration: 0.45,
    move: 'free',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    projectile: BEAM,
    ammo: 'main',
    cancels: { into: [...BOOST_STEP, 'sub', 'special-shot'], opens: 'afterFire', early: ['step'] },
  }),
  // 武装表「サブ射撃」。足を止めて撃つ。メインでキャンセルすると落下（アメキャン）
  subN: act('sub-n', 'Nサブ ミサイル', {
    duration: 0.6,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    projectile: MISSILE,
    ammo: 'sub',
    fallCancel: true,
    cancels: { into: [...BOOST_STEP, 'shot'], opens: 'afterFire' },
  }),
  // 「横サブ」: 横へ転がりながら撃つ
  subSide: act('sub-side', '横サブ 移動撃ち', {
    duration: 0.8,
    move: 'roll',
    speed: 20,
    boostCost: 6,
    boostPerSec: 0,
    fireAt: 0.4,
    projectile: MISSILE,
    ammo: 'sub',
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
  // 「特殊射撃」: アシスト呼出。アシストの種類は sim/actions.ts の AssistKind
  assist: act('assist', '特射 アシスト呼出', {
    duration: 0.5,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    assist: 'freedom-shot',
    ammo: 'assist',
    pose: 'summon',
    fallCancel: true,
    cancels: { into: [...BOOST_STEP, 'shot'], opens: 'afterFire' },
  }),
};

// ---- 格闘系 ----

/** 格闘の共通形。wiki の「格闘」欄の段数を comboMax に書く */
function melee(id: string, label: string, extra: Partial<ActionDef> = {}): ActionDef {
  return act(id, label, {
    duration: 0.9,
    move: 'lunge',
    speed: 28,
    lungeTime: 0.55,
    boostCost: 5,
    boostPerSec: 0,
    fireAt: 0.55,
    strike: true,
    comboMax: 3,
    cancels: { into: ['melee', ...BOOST_STEP], opens: 'afterFire' },
    ...extra,
  });
}

const M = {
  n: melee('n-melee', 'N格'),
  side: melee('side-melee', '横格', { curve: 10 }),
  front: melee('front-melee', '前格', { comboMax: 1, speed: 32 }),
  bd: melee('bd-melee', 'BD格', { speed: 34, lungeTime: 0.7, fireAt: 0.65 }),
  // 「N格 後派生」: 格闘中に後ろレバー＋格闘
  backDerive: melee('back-derive', 'N格 後派生', { comboMax: 1, speed: 0, lungeTime: 0, fireAt: 0.35, duration: 0.8 }),
};

/** 後派生できる格闘 */
const DERIVABLE = new Set([M.n.id, M.side.id]);
/** 追加入力で同じ技の次の段を出せる格闘 */
const COMBO_MELEE = new Set(Object.values(M).map((m) => m.id));

function resolveTemplate(slot: MechAction, ctx: ResolveContext): ActionDef | Rejection {
  const { lever, current, currentSlot } = ctx;
  switch (slot) {
    case 'shot':
      return S.main;
    case 'sub':
      return lever === 'side' ? S.subSide : S.subN;
    case 'special-shot':
      return S.assist;
    case 'melee': {
      // 格闘中の追加入力: 後ろレバーなら後派生、それ以外は同じ格闘の次の段
      if (currentSlot === 'melee' && current && COMBO_MELEE.has(current.id ?? '')) {
        if (lever === 'back' && DERIVABLE.has(current.id ?? '')) return M.backDerive;
        return current;
      }
      if (ctx.inBd) return M.bd;
      return lever === 'side' ? M.side : lever === 'front' ? M.front : M.n;
    }
    case 'melee-cs':
      // 持っていない武装は理由を返すと HUD に出る
      return { reject: '格CS なし' };
    default:
      // ジャンプ・BD・ステップと、まだ書いていないスロットは汎用の技を使う
      return ACTIONS[slot];
  }
}

export const TEMPLATE_UNIT: UnitDef = {
  id: 'template',
  name: '雛形',
  pilot: '—',
  cost: 2000,
  series: '—',
  description: '新しい機体の雛形。',
  // BD 回数 6 なら 4 / 6（汎用機の 4 回が 1）
  boostScale: 4 / 6,
  ammo: {
    main: { label: 'BR', max: 7, reload: 3, mode: 'each' },
    sub: { label: 'ミサイル', max: 2, reload: 6, mode: 'each' },
    assist: { label: 'アシスト', max: 2, reload: 12, mode: 'empty' },
  },
  resolve: resolveTemplate,
  look: {
    frame: '#eef0f3',
    chest: '#2546c9',
    accent: '#d8352c',
    trim: '#f2c21a',
    backpack: 'standard',
    meleeWeapon: 'saber',
  },
  commands: [
    { input: '射撃', name: 'BR（7 発）', note: 'サブ・特射でキャンセル可' },
    { input: 'サブ（射撃＋格闘）', name: 'ミサイル', note: '横で移動撃ち。メインでアメキャン' },
    { input: '特射（射撃＋ジャンプ）', name: 'アシスト呼出', note: 'メインでアメキャン' },
    { input: '格闘', name: 'N格・横格・前格・BD格', note: '追加入力で次の段、後ろで後派生' },
  ],
};
