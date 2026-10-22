import type { ActionKind, ProjectileKind } from './types';

export const GRAVITY = 30;
export const BOOST_MAX = 100;
/** 着地硬直。これが明けるとブーストが全回復する */
export const LANDING_LAG_S = 0.25;
/** 格闘の踏み込みを止める敵との距離 */
export const MELEE_REACH = 3;
/** 格闘の攻撃判定が届く距離 */
export const MELEE_HIT_RANGE = 5;
/** 地上でレバーを倒したときの歩きの速さ */
export const WALK_SPEED = 9;
/** 空中・上昇中にレバーで横へ流れる速さ */
export const AIR_DRIFT_SPEED = 7;
/** 同じ方向にレバーを 2 回倒してステップになる間隔 */
export const STEP_TAP_WINDOW_S = 0.25;
/** BD 中にレバーの方向へ曲がる速さ（rad/s）。BD 旋回 */
export const BD_TURN_RATE = 3.2;
/** 機体が向き直る速さ（rad/s） */
export const FACE_TURN_RATE = 9;
/** 慣性ジャンプ中、慣性の方向にレバーを入れたときの加速（m/s²） */
export const INERTIA_LEVER_ACCEL = 14;
/** 慣性ジャンプ中の水平速度の上限 */
export const INERTIA_MAX_SPEED = 34;
/** 振り向き撃ちで向き直るのにかかる時間。この分だけ発射と硬直が遅れる */
export const TURN_SHOT_DELAY_S = 0.22;
/** 滑り特射: ジャンプを押してからこの時間内に特射を出し、レバーを入れていれば滑る */
export const SLIDE_WINDOW_S = 0.15;
export const SLIDE_SPEED = 24;
/** 着地硬直が延び始めるブーストの吹かし回数と、1 回ごとの延び（秒） */
export const AIR_BOOST_FREE_USES = 3;
export const LANDING_LAG_PER_USE_S = 0.1;
export const LANDING_LAG_MAX_S = 0.75;

/**
 * 行動中の移動の仕方。
 * - free: 重力と慣性に任せる
 * - halt: 足を止める（地上では水平速度を殺し、空中では落下をゆるめる）。振り向き撃ちもこれ
 * - dash: 敵方向へ一定速度。落下しない
 * - lunge: 敵へ踏み込む。届いたら止まる。落下しない
 * - rise: 上昇し続ける（ジャンプ）。レバーで横に流れる
 * - step: 決まった向きへ素早く滑る。落下しない
 */
export type MoveMode = 'free' | 'halt' | 'dash' | 'lunge' | 'rise' | 'step';

export type ProjectileSpec = {
  kind: ProjectileKind;
  speed: number;
  radius: number;
  life: number;
  homing: number;
  /** 発射数と左右の広がり（rad） */
  count: number;
  spread: number;
};

export type ActionDef = {
  duration: number;
  move: MoveMode;
  /** dash / lunge の速度 */
  speed?: number;
  /** lunge で踏み込む上限時間 */
  lungeTime?: number;
  /** 開始時に消費するブースト */
  boostCost: number;
  /** 行動中に毎秒消費するブースト */
  boostPerSec: number;
  /** 開始時の上向き初速 */
  riseSpeed?: number;
  /**
   * ジャンプボタンを押している間だけ続く行動。minTime を過ぎてボタンが離れていたら終わる
   * （duration は押しっぱなしでも切れる上限）
   */
  holdMinTime?: number;
  /** 弾を出す・攻撃判定を出すタイミング（秒） */
  fireAt?: number;
  projectile?: ProjectileSpec;
  /** 近接攻撃 */
  strike?: boolean;
  label: string;
};

export const ACTIONS: Readonly<Record<Exclude<ActionKind, 'idle'>, ActionDef>> = {
  // BR は移動撃ち（慣性と落下はそのまま）。敵が後ろにいるときだけ振り向き撃ちで足が止まる
  shot: {
    label: 'BR',
    duration: 0.45,
    move: 'free',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    projectile: { kind: 'beam', speed: 120, radius: 0.18, life: 1.2, homing: 0.6, count: 1, spread: 0 },
  },
  melee: {
    label: '格闘',
    duration: 0.95,
    move: 'lunge',
    speed: 28,
    lungeTime: 0.6,
    boostCost: 5,
    boostPerSec: 0,
    fireAt: 0.6,
    strike: true,
  },
  jump: {
    label: 'ジャンプ',
    duration: 10,
    holdMinTime: 0.12,
    move: 'rise',
    speed: 14,
    boostCost: 4,
    boostPerSec: 30,
  },
  bd: {
    label: 'BD',
    duration: 10,
    holdMinTime: 0.35,
    move: 'dash',
    speed: 30,
    boostCost: 12,
    boostPerSec: 25,
  },
  step: {
    label: 'ステップ',
    duration: 0.38,
    move: 'step',
    speed: 26,
    boostCost: 12,
    boostPerSec: 0,
  },
  sub: {
    label: 'サブ',
    duration: 0.6,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    projectile: { kind: 'missile', speed: 45, radius: 0.3, life: 3, homing: 2.5, count: 3, spread: 0.5 },
  },
  'special-shot': {
    label: '特射',
    duration: 0.8,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.3,
    projectile: { kind: 'big-beam', speed: 90, radius: 0.6, life: 1.5, homing: 0.3, count: 1, spread: 0 },
  },
  'special-melee': {
    label: '特格',
    duration: 0.7,
    move: 'free',
    boostCost: 10,
    boostPerSec: 0,
    riseSpeed: 14,
    fireAt: 0.25,
    strike: true,
  },
  'shot-cs': {
    label: '射CS',
    duration: 0.9,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    projectile: { kind: 'cs-beam', speed: 80, radius: 0.9, life: 1.8, homing: 0, count: 1, spread: 0 },
  },
  'melee-cs': {
    label: '格CS',
    duration: 0.9,
    move: 'lunge',
    speed: 40,
    lungeTime: 0.45,
    boostCost: 10,
    boostPerSec: 0,
    fireAt: 0.45,
    strike: true,
  },
};

export function actionLabel(action: ActionKind): string {
  return action === 'idle' ? '' : ACTIONS[action].label;
}
