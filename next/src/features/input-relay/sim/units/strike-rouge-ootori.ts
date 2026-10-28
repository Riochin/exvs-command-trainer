import { ACTIONS, type ActionDef, type ProjectileSpec } from '../actions';
import type { MechAction } from '../types';
import { actionMaker, BOOST_STEP } from './helpers';
import type { ResolveContext, Rejection, UnitDef } from './types';

/**
 * ストライクルージュ（オオトリ装備）。
 *
 * 出典: EXVS2IB wiki https://w.atwiki.jp/exvs2infiniteboost/pages/117.html
 * 武装・キャンセルルートを元に、レバー入れの技・弾数・SEED 発現（時限強化）・アシスト・
 * オオトリ射出（背中の装備を飛ばす）を持つ。
 */

const BEAM: ProjectileSpec = { kind: 'beam', speed: 120, radius: 0.18, life: 1.2, homing: 0.6, count: 1, spread: 0 };
const LAUNCHER: ProjectileSpec = { kind: 'big-beam', speed: 100, radius: 0.55, life: 1.4, homing: 0.4, count: 1, spread: 0 };
const RAIL: ProjectileSpec = { kind: 'rail', speed: 170, radius: 0.2, life: 1, homing: 0.3, count: 1, spread: 0 };
const LASER: ProjectileSpec = { kind: 'laser', speed: 140, radius: 0.5, life: 0.6, homing: 0.15, count: 1, spread: 0 };
const SMALL_MISSILE: ProjectileSpec = { kind: 'small-missile', speed: 60, radius: 0.15, life: 2, homing: 1.4, count: 2, spread: 0.35 };
const SWORD: ProjectileSpec = { kind: 'sword', speed: 60, radius: 0.5, life: 1.6, homing: 0.3, count: 1, spread: 0 };

const rouge = actionMaker('rouge');

const R = {
  main: rouge('main', 'BR', {
    duration: 0.45,
    move: 'free',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    projectile: BEAM,
    ammo: 'main',
    linkAssists: true,
    // メイン→各サブ、後格（オオトリ射出）
    cancels: { into: [...BOOST_STEP, 'sub', 'rouge-ootori'], opens: 'afterFire', early: ['step'] },
  }),
  subN: rouge('sub-n', 'Nサブ ビームランチャー', {
    duration: 0.75,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.25,
    projectile: LAUNCHER,
    ammo: 'sub',
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
  subSide: rouge('sub-side', '横サブ 移動撃ち', {
    duration: 0.8,
    move: 'roll',
    speed: 20,
    boostCost: 6,
    boostPerSec: 0,
    fireAt: 0.4,
    projectile: { ...LAUNCHER, homing: 0.25 },
    ammo: 'sub',
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
  subBack: rouge('sub-back', '後サブ 照射', {
    duration: 1.6,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.35,
    volley: { count: 10, interval: 0.08 },
    projectile: LASER,
    ammo: 'sub',
    ammoCost: 2,
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
  freedomShot: rouge('freedom-shot', '特射 フリーダム呼出', {
    duration: 0.5,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    assist: 'freedom-shot',
    ammo: 'freedom',
    pose: 'summon',
    fallCancel: true,
    cancels: { into: [...BOOST_STEP, 'shot'], opens: 'afterFire' },
  }),
  freedomMelee: rouge('freedom-melee', 'レバー特射 フリーダム突撃', {
    duration: 0.5,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    assist: 'freedom-melee',
    ammo: 'freedom',
    pose: 'summon',
    fallCancel: true,
    cancels: { into: [...BOOST_STEP, 'shot'], opens: 'afterFire' },
  }),
  murasame: rouge('murasame', '射CS ムラサメ呼出', {
    duration: 0.4,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    assist: 'murasame',
    pose: 'summon',
    fallCancel: true,
    cancels: { into: [...BOOST_STEP, 'shot'], opens: 'afterFire' },
  }),
  ootori: rouge('ootori', '後格 オオトリ射出', {
    duration: 0.5,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    assist: 'ootori',
    ammo: 'ootori',
    pose: 'shoot',
    fallCancel: true,
    cancels: { into: [...BOOST_STEP, 'shot'], opens: 'afterFire' },
  }),
  seed: rouge('seed', '格CS SEED発現', {
    duration: 0.6,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    buff: 'seed',
    pose: 'summon',
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
  missiles: rouge('missiles', '格CS 小型ミサイル', {
    duration: 0.9,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    volley: { count: 6, interval: 0.07 },
    projectile: SMALL_MISSILE,
    cancels: { into: [...BOOST_STEP, 'sub'], opens: 'afterFire' },
  }),
  swordThrow: rouge('sword-throw', '後特格 対艦刀投擲', {
    // 足は止まるが慣性は残る。正面を向いて投げる
    duration: 0.6,
    move: 'free',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.25,
    projectile: SWORD,
    pose: 'throw',
    cancels: { into: [...BOOST_STEP, 'rouge-throw-derive'], opens: 'afterFire' },
  }),
  throwDerive: rouge('throw-derive', '後特格格闘派生 突き刺し→ミサイル', {
    duration: 1.1,
    move: 'lunge',
    speed: 30,
    lungeTime: 0.4,
    boostCost: 5,
    boostPerSec: 0,
    fireAt: 0.4,
    strike: true,
    volley: { count: 4, interval: 0.1 },
    projectile: { ...SMALL_MISSILE, count: 1 },
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
};

function melee(id: string, label: string, extra: Partial<ActionDef> = {}): ActionDef {
  return rouge(id, label, {
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
  n: melee('n-melee', 'N格 対艦刀'),
  side: melee('side-melee', '横格', { curve: 10 }),
  front: melee('front-melee', '前格 盾殴り→斬り上げ', { comboMax: 2, speed: 26 }),
  bd: melee('bd-melee', 'BD格 斬り抜け', { speed: 34, lungeTime: 0.7, fireAt: 0.65 }),
  backDerive: melee('back-derive', '後派生 突き刺し→開き斬り', { comboMax: 1, speed: 0, lungeTime: 0, fireAt: 0.35, duration: 0.8 }),
  backDeriveSeed: melee('back-derive-seed', '後派生 連続斬り（SEED）', { comboMax: 1, speed: 0, lungeTime: 0, fireAt: 0.3, duration: 1.4 }),
  knifeN: melee('knife-n', 'N格 対装甲ナイフ'),
  knifeSide: melee('knife-side', '横格 対装甲ナイフ', { comboMax: 2, curve: 10 }),
  knifeFront: melee('knife-front', '前格 盾殴り→ナイフ', { comboMax: 2, speed: 26 }),
  nSpecial: melee('n-special', 'N特格 対艦刀突き', { speed: 22, lungeTime: 0.7, fireAt: 0.7 }),
  sideSpecial: melee('side-special', '横特格 斬り抜け（SEED）', { comboMax: 2, speed: 38, curve: 18, lungeTime: 0.5, fireAt: 0.5 }),
};

/** 追加入力で同じ技を続けられ、後ろレバーで後派生できる格闘 */
const DERIVABLE = new Set([M.n.id, M.side.id, M.bd.id]);
const COMBO_MELEE = new Set(Object.values(M).map((m) => m.id));

function resolveRouge(slot: MechAction, ctx: ResolveContext): ActionDef | Rejection {
  const { lever, seed, packOut, current, currentSlot } = ctx;
  switch (slot) {
    case 'shot':
      // SEED 中はメインから各特格にもキャンセルできる
      return seed
        ? { ...R.main, id: R.main.id, cancels: { ...R.main.cancels!, into: [...R.main.cancels!.into, 'special-melee'] } }
        : R.main;
    case 'sub': {
      if (packOut) return { reject: 'オオトリ射出中' };
      const base = lever === 'side' ? R.subSide : lever === 'back' ? R.subBack : R.subN;
      if (!seed) return base;
      // SEED 中はレールガンも一緒に撃つ
      if (base === R.subBack) return { ...base, label: '後サブ 一斉射撃（SEED）', projectiles: [LASER, { ...SMALL_MISSILE, count: 1 }] };
      return { ...base, label: `${base.label}＋レールガン`, projectiles: [RAIL, base.projectile!] };
    }
    case 'special-shot':
      return lever === 'N' ? R.freedomShot : R.freedomMelee;
    case 'shot-cs':
      return R.murasame;
    case 'melee-cs':
      if (seed) return R.missiles;
      if (ctx.seedCooldown > 0) return { reject: 'SEED チャージ中' };
      return R.seed;
    case 'melee': {
      // 格闘中の追加入力: 後ろレバーなら後派生、それ以外は同じ格闘の次の段
      if (currentSlot === 'melee' && current && COMBO_MELEE.has(current.id ?? '')) {
        if (lever === 'back' && DERIVABLE.has(current.id ?? '')) return seed ? M.backDeriveSeed : M.backDerive;
        return current;
      }
      if (currentSlot === 'special-melee' && current?.id === R.swordThrow.id) return R.throwDerive;
      if (packOut) {
        if (lever === 'back') return { reject: 'オオトリ射出中' };
        return lever === 'side' ? M.knifeSide : lever === 'front' ? M.knifeFront : M.knifeN;
      }
      if (lever === 'back') return R.ootori;
      if (ctx.inBd) return M.bd;
      return lever === 'side' ? M.side : lever === 'front' ? M.front : M.n;
    }
    case 'special-melee': {
      if (currentSlot === 'special-melee' && current && COMBO_MELEE.has(current.id ?? '')) return current;
      if (packOut) return { reject: 'オオトリ射出中' };
      if (lever === 'back') return R.swordThrow;
      if (lever === 'side' && seed) return M.sideSpecial;
      return M.nSpecial;
    }
    default:
      return ACTIONS[slot];
  }
}

export const STRIKE_ROUGE_OOTORI: UnitDef = {
  id: 'strike-rouge-ootori',
  name: 'ストライクルージュ（オオトリ装備）',
  pilot: 'カガリ・ユラ・アスハ',
  cost: 2000,
  series: '機動戦士ガンダムSEED DESTINY',
  description:
    '射撃寄り万能機・時限強化機。アシストと後格メインの降りテクが豊富。格CS で SEED 発現（機動力とサブが強化）。',
  // BD 回数 6（SEED 中 8）。汎用機はおよそ 4 回なので、それに合わせて消費を減らす
  boostScale: 4 / 6,
  seedBoostScale: 4 / 8,
  seedSpeedScale: 1.15,
  seedDuration: 20,
  seedCooldown: 15,
  /** 基本情報の「盾コマンド あり」 */
  shieldGuard: true,
  ammo: {
    main: { label: 'BR', max: 8, reload: 3, mode: 'each' },
    sub: { label: 'ランチャー', max: 2, reload: 7, mode: 'each', seedReload: 4, refillOnSeed: true },
    freedom: { label: 'フリーダム', max: 2, reload: 14, mode: 'empty' },
    ootori: { label: 'オオトリ', max: 1, reload: 10, mode: 'each', waitsForPack: true },
  },
  resolve: resolveRouge,
  look: {
    frame: '#e5557f',
    chest: '#f2f2f4',
    accent: '#2f3340',
    trim: '#f2c21a',
    backpack: 'ootori',
    meleeWeapon: 'blade',
  },
  commands: [
    { input: '射撃', name: 'BR（8 発）', note: 'サブ・後格でキャンセル可' },
    { input: '射撃長押し', name: 'ムラサメ呼出', note: '追従してメインに合わせて撃つ。メインでアメキャン' },
    { input: 'サブ（射撃＋格闘）', name: 'ビームランチャー構え撃ち', note: '横で移動撃ち、後で照射（2 発消費）' },
    { input: '特射（射撃＋ジャンプ）', name: 'フリーダム呼出', note: 'レバー入れで格闘アシスト。メインでアメキャン' },
    { input: '後格', name: 'オオトリ射出', note: 'メインで落下。射出中はサブ・特格不可、格闘がナイフに' },
    { input: '格闘', name: 'N格・横格・前格・BD格', note: '追加入力で次の段、後ろで後派生' },
    { input: '特格（格闘＋ジャンプ）', name: 'N特格 対艦刀突き', note: '後で投擲（格闘派生あり）、SEED 中の横で斬り抜け' },
    { input: '格闘長押し', name: 'SEED 発現（20 秒）', note: 'サブ強化・機動力アップ。発現中はミサイル' },
  ],
  weapons: [
    { ammo: 'main', buttons: ['shot'], charge: 'shot' },
    { ammo: 'sub', buttons: ['shot', 'melee'] },
    { ammo: 'freedom', buttons: ['shot', 'jump'] },
    { ammo: 'ootori', buttons: ['melee'], lever: 'back' },
    { buttons: ['melee'], charge: 'melee' },
  ],
};
