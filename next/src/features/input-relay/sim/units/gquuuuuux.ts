import { ACTIONS, type ActionDef, type ProjectileSpec } from '../actions';
import type { MechAction } from '../types';
import { actionMaker, BOOST_STEP } from './helpers';
import type { ResolveContext, Rejection, UnitDef } from './types';

/**
 * GQuuuuuuX（ジークアクス）。
 *
 * 出典: EXVS2IB wiki https://w.atwiki.jp/exvs2infiniteboost/pages/610.html （2026-10-28 確認、2026/04/27 アップデート後）
 * 格闘寄り万能機。サブでエスビットを展開（メイン連動・サブ再入力で撃つ、後サブで投げて解除）、
 * 特射で GFreD 呼出、通常時の特格は特殊移動。格闘CS のオメガ・サイコミュ解放（時限強化）で
 * 射撃CS・後格・特格（鞭）・格闘前派生が差し替わる。
 * 覚醒技（強化への移行を含む）は扱わない。弾速・発生などの数値は wiki に無いので実機の値は未確認。
 */

// ---- 弾 ----

const BEAM: ProjectileSpec = { kind: 'beam', speed: 120, radius: 0.18, life: 1.2, homing: 0.6, count: 1, spread: 0 };
/** 通常時の射撃CS。弾速は遅め */
const CS_BEAM: ProjectileSpec = { kind: 'beam', speed: 90, radius: 0.3, life: 1.6, homing: 0.4, count: 1, spread: 0 };
/** 強化中の N 射撃CS。高弾速 */
const CS_MAX_BEAM: ProjectileSpec = { kind: 'big-beam', speed: 170, radius: 0.4, life: 1, homing: 0.3, count: 1, spread: 0 };
const HEAT_HAWK: ProjectileSpec = { kind: 'heat-hawk', speed: 70, radius: 0.5, life: 1.5, homing: 0.5, count: 1, spread: 0 };
const BIT: ProjectileSpec = { kind: 'bit', speed: 100, radius: 0.35, life: 1.4, homing: 0.4, count: 1, spread: 0 };

const gqx = actionMaker('gqx');

// ---- 格闘（技の id をキャンセルルートで先に使うので、射撃より先に置く） ----

function melee(id: string, label: string, extra: Partial<ActionDef> = {}): ActionDef & { id: string } {
  return gqx(id, label, {
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

/** 1 段で終わる格闘 */
const single = { comboMax: 1 } as const;

const M = {
  n: melee('n-melee', 'N格 ビーム・サーベル', { speed: 25 }),
  front: melee('front-melee', '前格 横薙ぎ→薙ぎ払い', { comboMax: 2, speed: 26 }),
  side: melee('side-melee', '横格 二刀流', { curve: 10 }),
  bd: melee('bd-melee', 'BD格 突き刺し→金的蹴り', { comboMax: 2, speed: 34, lungeTime: 0.7, fireAt: 0.65 }),
  frontDerive: melee('front-derive', '前派生 蹴り抜け→斬り下ろし', { comboMax: 2, speed: 30, lungeTime: 0.3, fireAt: 0.35 }),
  frontDeriveSeed: melee('front-derive-seed', '前派生 連続斬り抜け（オメガ）', {
    ...single,
    speed: 36,
    lungeTime: 0.4,
    fireAt: 0.35,
    duration: 1.5,
  }),
  backDerive: melee('back-derive', '後派生 巴投げ', { ...single, speed: 0, lungeTime: 0, fireAt: 0.35, duration: 1.1 }),
  /** 強化中の後格。メインからキャンセルできる */
  seedSlash: melee('seed-slash', '後格 斬り抜け（オメガ）', { ...single, speed: 36, lungeTime: 0.4, fireAt: 0.4, duration: 0.8 }),
  /** 通常時の特格（特殊移動）からの格闘派生 */
  hawkSlash: melee('hawk-slash', '特格格闘派生 ヒート・ホーク斬り払い', {
    ...single,
    speed: 20,
    lungeTime: 0.3,
    fireAt: 0.3,
    duration: 0.7,
  }),
  /** 後サブ（エスビット投擲）からの格闘派生。フワ格 */
  jumpSlash: melee('jump-slash', '後サブ格闘派生 ジャンプ斬り', { ...single, speed: 26, lungeTime: 0.5, fireAt: 0.5, duration: 0.9 }),
};

/** 追加入力で次の段を出せる格闘 */
const COMBO_MELEE = new Set(Object.values(M).map((m) => m.id));
/** 前派生・後派生できる格闘（強化中の後格からも前派生できる） */
const FRONT_DERIVABLE = new Set([M.n.id, M.side.id, M.seedSlash.id]);
const BACK_DERIVABLE = new Set([M.n.id, M.side.id]);

// ---- サブ・特射・後格 ----

const S = {
  /** 通常時の後格。弾数無限の投擲 */
  hawk: gqx('hawk', '後格 ヒート・ホーク投擲', {
    duration: 0.6,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.25,
    projectile: HEAT_HAWK,
    pose: 'throw',
    cancels: { into: [...BOOST_STEP, 'special-melee'], opens: 'afterFire' },
  }),
  deploy: gqx('esbit-deploy', 'サブ エスビット展開', {
    duration: 0.5,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    assist: 'esbit',
    ammo: 'sub',
    pose: 'summon',
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
  /** 展開中のサブ再入力。足を止めずにエスビットだけが撃つ。足の止まる技からキャンセルすると落下（アサキャン） */
  esbitFire: gqx('esbit-fire', 'サブ エスビット射撃', {
    duration: 0.35,
    move: 'free',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.05,
    linkAssists: true,
    fallOnCancel: true,
    pose: 'none',
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
  /** 展開中の後サブ。飛び上がってエスビットを投げ、展開を解除する */
  esbitThrow: gqx('esbit-throw', '後サブ エスビット投擲', {
    duration: 0.7,
    move: 'free',
    riseSpeed: 8,
    boostCost: 5,
    boostPerSec: 0,
    fireAt: 0.3,
    projectile: BIT,
    dismissAssist: 'esbit',
    pose: 'throw',
    cancels: { into: [...BOOST_STEP, M.jumpSlash.id], opens: 'afterFire' },
  }),
};

/** 展開中のサブ（射撃と投擲）。特射からはこれだけにキャンセルできる */
const DEPLOYED_SUBS = [S.esbitFire.id, S.esbitThrow.id];

function gfred(id: string, label: string, assist: 'gfred-shot' | 'gfred-melee') {
  return gqx(id, label, {
    duration: 0.5,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    assist,
    ammo: 'gfred',
    pose: 'summon',
    fallCancel: true,
    cancels: { into: [...BOOST_STEP, 'shot', ...DEPLOYED_SUBS, 'special-melee'], opens: 'afterFire' },
  });
}

const GFRED = {
  shot: gfred('gfred-shot', 'N特射 GFreD 呼出（ライフル）', 'gfred-shot'),
  melee: gfred('gfred-melee', 'レバー特射 GFreD 呼出（突撃）', 'gfred-melee'),
};

// ---- 特格（通常時: 特殊移動 / 強化中: 鞭） ----

function specialMove(id: string, label: string, moveDir: 'front' | 'side' | 'back') {
  return gqx(id, label, {
    // 弾も判定も出さないが、fireAt を過ぎたら各行動にキャンセルできる
    duration: 0.5,
    move: 'roll',
    moveDir,
    speed: 24,
    boostCost: 4,
    boostPerSec: 0,
    fireAt: 0.1,
    pose: 'none',
    fallCancel: true,
    // 特格の連続入力に対応する
    comboMax: 10,
    cancels: { into: [...BOOST_STEP, 'shot', 'special-shot', 'special-melee', S.hawk.id, M.hawkSlash.id], opens: 'afterFire' },
  });
}

const MOVES = {
  n: specialMove('move-n', '特格 特殊移動（前転）', 'front'),
  side: specialMove('move-side', '横特格 特殊移動', 'side'),
  back: specialMove('move-back', '後特格 特殊移動', 'back'),
};
const MOVE_IDS = new Set(Object.values(MOVES).map((m) => m.id));

/** 強化中の特格からの特格派生。スーパーアーマーの突撃掴み */
const GRAB = melee('grab', '特格派生 突撃掴み', { ...single, speed: 32, lungeTime: 0.6, fireAt: 0.6, duration: 1.3, cancels: { into: BOOST_STEP, opens: 'afterFire' } });

function whip(id: string, label: string, extra: Partial<ActionDef>) {
  return melee(id, label, {
    ...single,
    ammo: 'whip',
    // 鞭のように伸びる長いリーチ
    reach: 10,
    // 当たる前に特格をもう一度押すと突撃掴みへ
    cancels: { into: [...BOOST_STEP, 'shot-cs', GRAB.id], opens: 'afterFire', early: [GRAB.id] },
    ...extra,
  });
}

const WHIPS = {
  n: whip('whip-n', '特格 斬り上げ（オメガ）', { move: 'free', riseSpeed: 9, boostCost: 6, fireAt: 0.3, duration: 0.8 }),
  side: whip('whip-side', '横特格 移動斬り抜け（オメガ）', { speed: 30, curve: 18, lungeTime: 0.45, fireAt: 0.45, reach: 9 }),
  back: whip('whip-back', '後特格 薙ぎ払い（オメガ）', { move: 'free', boostCost: 4, fireAt: 0.25, duration: 0.8, reach: 9 }),
};
const WHIP_IDS = new Set(Object.values(WHIPS).map((m) => m.id));

// ---- メイン・射撃CS・格闘CS ----

const SHOT_CS_CANCELS = { into: [...BOOST_STEP, 'sub', 'special-melee'], opens: 'afterFire' } as const;

const R = {
  main: gqx('main', 'BR', {
    duration: 0.45,
    move: 'free',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    projectile: BEAM,
    ammo: 'main',
    // 展開中のエスビットも一緒に撃つ
    linkAssists: true,
    // メイン→各サブ、各特射、各特格（強化中も）、後格（強化中も）
    cancels: { into: [...BOOST_STEP, 'sub', 'special-shot', 'special-melee', S.hawk.id, M.seedSlash.id], opens: 'afterFire', early: ['step'] },
  }),
  cs: gqx('cs', '射CS 高出力', {
    duration: 0.7,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    projectile: CS_BEAM,
    // エスビット展開中ならサブで落下できる
    fallCancel: true,
    cancels: SHOT_CS_CANCELS,
  }),
  csMax: gqx('cs-max', '射CS 最大出力（オメガ）', {
    duration: 0.75,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.25,
    projectile: CS_MAX_BEAM,
    fallCancel: true,
    cancels: SHOT_CS_CANCELS,
  }),
  csRoll: gqx('cs-roll', '横射CS 移動連射（オメガ）', {
    duration: 0.8,
    move: 'roll',
    speed: 18,
    boostCost: 6,
    boostPerSec: 0,
    fireAt: 0.15,
    volley: { count: 3, interval: 0.15 },
    projectile: BEAM,
    // サブでキャンセルすると横の慣性を乗せて落下する
    fallCancel: true,
    cancels: SHOT_CS_CANCELS,
  }),
  omega: gqx('omega', '格CS オメガ・サイコミュ解放', {
    duration: 0.6,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    buff: 'seed',
    pose: 'summon',
    cancels: { into: BOOST_STEP, opens: 'afterFire' },
  }),
};

function resolveGquuuuuux(slot: MechAction, ctx: ResolveContext): ActionDef | Rejection {
  const { lever, seed, current, currentSlot } = ctx;
  const esbitOut = ctx.assists.includes('esbit');
  switch (slot) {
    case 'shot':
      return R.main;
    case 'shot-cs':
      if (!seed) return R.cs;
      return lever === 'side' ? R.csRoll : R.csMax;
    case 'sub':
      if (esbitOut) return lever === 'back' ? S.esbitThrow : S.esbitFire;
      // 特射の GFreD が出ているあいだは展開できない
      if (ctx.assists.includes('gfred-shot') || ctx.assists.includes('gfred-melee')) return { reject: 'GFreD 出撃中' };
      return S.deploy;
    case 'special-shot':
      return lever === 'N' ? GFRED.shot : GFRED.melee;
    case 'melee-cs':
      if (seed) return { reject: 'オメガ・サイコミュ解放中' };
      if (ctx.seedCooldown > 0) return { reject: 'オメガ・サイコミュ チャージ中' };
      return R.omega;
    case 'melee': {
      // 格闘中の追加入力: 前・後ろレバーなら派生、それ以外は同じ格闘の次の段
      if (currentSlot === 'melee' && current && COMBO_MELEE.has(current.id ?? '')) {
        if (lever === 'front' && FRONT_DERIVABLE.has(current.id ?? '')) return seed ? M.frontDeriveSeed : M.frontDerive;
        if (lever === 'back' && BACK_DERIVABLE.has(current.id ?? '')) return M.backDerive;
        return current;
      }
      if (currentSlot === 'sub' && current?.id === S.esbitThrow.id) return M.jumpSlash;
      if (currentSlot === 'special-melee' && current && MOVE_IDS.has(current.id ?? '') && lever !== 'back') return M.hawkSlash;
      if (lever === 'back') return seed ? M.seedSlash : S.hawk;
      if (ctx.inBd) return M.bd;
      return lever === 'side' ? M.side : lever === 'front' ? M.front : M.n;
    }
    case 'special-melee': {
      if (seed) {
        if (currentSlot === 'special-melee' && current && WHIP_IDS.has(current.id ?? '')) return GRAB;
        return lever === 'back' ? WHIPS.back : lever === 'side' ? WHIPS.side : WHIPS.n;
      }
      return lever === 'back' ? MOVES.back : lever === 'side' ? MOVES.side : MOVES.n;
    }
    default:
      return ACTIONS[slot];
  }
}

export const GQUUUUUUX: UnitDef = {
  id: 'gquuuuuux',
  name: 'GQuuuuuuX',
  pilot: 'アマテ・ユズリハ',
  cost: 2500,
  series: '機動戦士Gundam GQuuuuuuX',
  description:
    '格闘寄り万能機・時限強化機。サブのエスビットと特格の特殊移動で降りテクが豊富。格CS のオメガ・サイコミュ解放で鞭の特格と強い射撃CS が使える。',
  // BD 回数 7（オメガ・サイコミュ中 8）
  boostScale: 4 / 7,
  seedBoostScale: 4 / 8,
  seedSpeedScale: 1.15,
  seedDuration: 17,
  // wiki は「クールタイム 5 秒・リロード 14 秒」。終わってからまた使えるまでを 14 秒にしている
  seedCooldown: 14,
  ammo: {
    main: { label: 'BR', max: 8, reload: 3, mode: 'each' },
    sub: { label: 'エスビット', max: 1, reload: 14, mode: 'each', waitsForAssists: ['esbit'] },
    gfred: { label: 'GFreD', max: 1, reload: 7, mode: 'empty', waitsForAssists: ['gfred-shot', 'gfred-melee'] },
    whip: { label: '鞭', max: 2, reload: 5, mode: 'empty' },
  },
  resolve: resolveGquuuuuux,
  look: {
    frame: '#f1f2f5',
    chest: '#2b3f94',
    accent: '#d63a4a',
    trim: '#f0c330',
    backpack: 'standard',
    meleeWeapon: 'saber',
  },
  commands: [
    { input: '射撃', name: 'BR（8 発）', note: 'エスビット展開中は連動して撃つ。各サブ・各特射・各特格・後格へキャンセル可' },
    { input: '射撃長押し', name: '射CS 高出力', note: 'オメガ中は N で最大出力、横で移動連射。サブで落下' },
    { input: 'サブ（射撃＋格闘）', name: 'エスビット展開', note: '展開中はサブでエスビットだけ撃つ（アサキャン）。後サブで投げて解除、格闘で派生' },
    { input: '特射（射撃＋ジャンプ）', name: 'GFreD 呼出', note: 'N でライフル、レバー入れで突撃。メインでアメキャン' },
    { input: '特格（格闘＋ジャンプ）', name: '特殊移動', note: 'N で前転、横・後で移動。連続入力・メインで落下・格闘で斬り払い' },
    { input: '後格', name: 'ヒート・ホーク投擲', note: '特格へキャンセル可。オメガ中は斬り抜け（前派生あり）' },
    { input: '格闘', name: 'N格・横格・前格・BD格', note: '追加入力で次の段、前で蹴り抜け、後ろで巴投げ' },
    { input: '格闘長押し', name: 'オメガ・サイコミュ解放（17 秒）', note: '特格が鞭（2 発、当たる前に特格で突撃掴み）に、前派生が連続斬り抜けに' },
  ],
  weapons: [
    { ammo: 'main', buttons: ['shot'], charge: 'shot' },
    { ammo: 'sub', buttons: ['shot', 'melee'] },
    { ammo: 'gfred', buttons: ['shot', 'jump'] },
    { ammo: 'whip', buttons: ['melee', 'jump'], onlyInSeed: true },
    { buttons: ['melee'], charge: 'melee' },
  ],
};
