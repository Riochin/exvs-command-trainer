/**
 * 操作性を調べるときに、sim の状態を短く読むための道具。
 *
 * - snapshotWorld: 機体の今の状態を 1 行で読める形にまとめる（テストの時系列ログでも使う）
 * - exposeSimForDebug: 開発中だけ、ブラウザから `window.__inputRelay` で状態を読めるようにする
 */
import type { SimWorld } from './types';

export type SimSnapshot = {
  time: number;
  action: string;
  move: string | null;
  y: number;
  vy: number;
  grounded: boolean;
  landingLag: number;
  boost: number;
  overheat: boolean;
  jumpHeld: boolean;
  /** 機体の向きと敵の方向の開き（度）。振り向き撃ちの判定に使う */
  angleToEnemy: number;
  distanceToEnemy: number;
  chain: string[];
};

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

export function snapshotWorld(world: SimWorld): SimSnapshot {
  const { mech, enemy } = world;
  let diff = mech.yaw - mech.lockYaw;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return {
    time: round(world.time, 3),
    action: mech.action,
    move: mech.move?.id ?? null,
    y: round(mech.pos.y),
    vy: round(mech.vel.y),
    grounded: mech.grounded,
    landingLag: round(mech.landingLag),
    boost: round(mech.boost, 1),
    overheat: mech.overheat,
    jumpHeld: mech.jumpHeld,
    angleToEnemy: Math.round((Math.abs(diff) * 180) / Math.PI),
    distanceToEnemy: round(Math.hypot(enemy.pos.x - mech.pos.x, enemy.pos.z - mech.pos.z), 1),
    chain: [...mech.chainLabels],
  };
}

/** ブラウザのコンソールから使う。`__inputRelay.snapshot()` / `__inputRelay.events()` / `__inputRelay.world` */
export type InputRelayDebugHandle = {
  readonly world: SimWorld;
  snapshot(): SimSnapshot;
  /** HUD に出た出来事（ルート名と出せなかった理由）のラベル */
  events(): string[];
};

declare global {
  interface Window {
    __inputRelay?: InputRelayDebugHandle;
  }
}

/** 開発中だけ window.__inputRelay を生やす。本番では何もしない。戻り値で外す */
export function exposeSimForDebug(getWorld: () => SimWorld): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return () => {};
  const handle: InputRelayDebugHandle = {
    get world() {
      return getWorld();
    },
    snapshot: () => snapshotWorld(getWorld()),
    events: () => getWorld().events.map((e) => e.label),
  };
  window.__inputRelay = handle;
  return () => {
    if (window.__inputRelay === handle) delete window.__inputRelay;
  };
}
