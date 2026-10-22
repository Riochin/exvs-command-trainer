import type { ActionKind, ProjectileKind } from './types';

export const GRAVITY = 30;
export const BOOST_MAX = 100;
/** 着地硬直。これが明けるとブーストが全回復する */
export const LANDING_LAG_S = 0.25;
/** 格闘の踏み込みを止める敵との距離 */
export const MELEE_REACH = 3;
/** 格闘の攻撃判定が届く距離 */
export const MELEE_HIT_RANGE = 5;

/**
 * 行動中の移動の仕方。
 * - free: 重力と慣性に任せる
 * - halt: 足を止める（地上では水平速度を殺し、空中では落下をゆるめる）
 * - dash: 敵方向へ一定速度。落下しない
 * - lunge: 敵へ踏み込む。届いたら止まる。落下しない
 */
export type MoveMode = 'free' | 'halt' | 'dash' | 'lunge';

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
  /** 弾を出す・攻撃判定を出すタイミング（秒） */
  fireAt?: number;
  projectile?: ProjectileSpec;
  /** 近接攻撃 */
  strike?: boolean;
  label: string;
};

export const ACTIONS: Readonly<Record<Exclude<ActionKind, 'idle'>, ActionDef>> = {
  shot: {
    label: 'BR',
    duration: 0.45,
    move: 'halt',
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
    duration: 0.4,
    move: 'free',
    boostCost: 8,
    boostPerSec: 0,
    riseSpeed: 18,
  },
  bd: {
    label: 'BD',
    duration: 0.5,
    move: 'dash',
    speed: 30,
    boostCost: 15,
    boostPerSec: 25,
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
