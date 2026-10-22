import type { ButtonType } from '@/types';
import {
  ACTIONS,
  BOOST_MAX,
  GRAVITY,
  LANDING_LAG_S,
  MELEE_HIT_RANGE,
  MELEE_REACH,
  type ActionDef,
} from './actions';
import { cancelState, INPUT_BUFFER_S, routeName } from './cancel';
import type { EffectKind, InputResult, MechAction, Projectile, SimWorld, Vec3 } from './types';

/**
 * 機体のシミュレーション。毎フレーム呼ぶので、world はコピーせずその場で書き換える。
 *
 * 行動中の入力は cancel.ts のキャンセルルートに従って、出す・受付まで待たせる・捨てるを決める。
 */

/** 敵は左右にゆっくり動き、ロックオンで機体の向きが追従するのを見せる */
const ENEMY_BASE: Vec3 = { x: 0, y: 0, z: -40 };
const ENEMY_SWAY = 12;
const ENEMY_SWAY_SPEED = 0.4;
const ENEMY_HIT_RADIUS = 2.5;
const HIT_FLASH_S = 0.3;

const EVENT_LIMIT = 8;
const EFFECT_LIFE: Readonly<Record<EffectKind, number>> = { hit: 0.35, muzzle: 0.12, land: 0.4, slash: 0.25 };

const INPUT_TO_ACTION: Partial<Record<ButtonType, MechAction>> = {
  shot: 'shot',
  melee: 'melee',
  jump: 'jump',
  bd: 'bd',
  sub: 'sub',
  'special-shot': 'special-shot',
  'special-melee': 'special-melee',
  'shot-charge-end': 'shot-cs',
  'melee-charge-end': 'melee-cs',
};

export function createWorld(): SimWorld {
  return {
    time: 0,
    mech: {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      boost: BOOST_MAX,
      overheat: false,
      grounded: true,
      landingLag: 0,
      action: 'idle',
      actionTime: 0,
      actionFired: false,
      charging: { shot: false, melee: false },
      meleeStage: 0,
      buffered: null,
      chain: [],
    },
    enemy: { pos: { ...ENEMY_BASE }, hitFlash: 0, hitCount: 0 },
    projectiles: [],
    nextProjectileId: 1,
    events: [],
    nextEventId: 1,
    effects: [],
    nextEffectId: 1,
  };
}

/** 機体から敵への水平方向の単位ベクトルと距離 */
function towardEnemy(world: SimWorld): { dx: number; dz: number; distance: number } {
  const dx = world.enemy.pos.x - world.mech.pos.x;
  const dz = world.enemy.pos.z - world.mech.pos.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return { dx: 0, dz: -1, distance: 0 };
  return { dx: dx / distance, dz: dz / distance, distance };
}

function pushEvent(world: SimWorld, kind: 'route' | 'reject', label: string): void {
  world.events.push({ id: world.nextEventId++, kind, label, time: world.time });
  if (world.events.length > EVENT_LIMIT) world.events.splice(0, world.events.length - EVENT_LIMIT);
}

function spawnEffect(world: SimWorld, kind: EffectKind, pos: Vec3): void {
  world.effects.push({ id: world.nextEffectId++, kind, pos: { ...pos }, age: 0, life: EFFECT_LIFE[kind] });
}

/** 行動を始める（キャンセルかどうかの判定は済んでいる前提）。ブーストが足りなければ false */
function startAction(world: SimWorld, kind: MechAction, canceled: boolean): boolean {
  const mech = world.mech;
  const def = ACTIONS[kind];
  const usesBoost = def.boostCost > 0 || def.boostPerSec > 0;
  if (usesBoost && mech.overheat) {
    pushEvent(world, 'reject', 'OVERHEAT');
    return false;
  }

  mech.boost -= def.boostCost;
  if (mech.boost <= 0) {
    mech.boost = 0;
    mech.overheat = true;
  }

  const comboMelee = canceled && kind === 'melee' && mech.action === 'melee';
  mech.meleeStage = kind === 'melee' ? (comboMelee ? mech.meleeStage + 1 : 1) : 0;
  mech.chain = canceled ? [...mech.chain, kind] : [kind];
  mech.action = kind;
  mech.actionFired = false;
  mech.buffered = null;
  // 格闘の 2・3 段目は踏み込みを省いてすぐ振る
  mech.actionTime = comboMelee && def.fireAt !== undefined ? Math.max(0, def.fireAt - 0.2) : 0;

  if (def.riseSpeed !== undefined) {
    mech.vel.y = def.riseSpeed;
    mech.grounded = false;
  }
  if (def.move === 'dash' || def.move === 'lunge') {
    // 空中で出しても高度を保つ
    mech.vel.y = 0;
  }

  const name = routeName(mech.chain, mech.meleeStage, canceled);
  if (name !== null) pushEvent(world, 'route', name);
  return true;
}

/**
 * 入力を受けて行動を始める。チャージ開始は行動ではなく「溜めている」状態として持つ。
 */
export function applyInput(world: SimWorld, button: ButtonType): InputResult {
  const mech = world.mech;
  if (button === 'shot-charge-start') {
    mech.charging.shot = true;
    return 'started';
  }
  if (button === 'melee-charge-start') {
    mech.charging.melee = true;
    return 'started';
  }
  if (button === 'shot-charge-end') mech.charging.shot = false;
  if (button === 'melee-charge-end') mech.charging.melee = false;

  const kind = INPUT_TO_ACTION[button];
  if (kind === undefined) return 'rejected';
  if (mech.landingLag > 0) {
    pushEvent(world, 'reject', '着地硬直');
    return 'rejected';
  }

  switch (cancelState(mech, kind)) {
    case 'free':
      return startAction(world, kind, false) ? 'started' : 'rejected';
    case 'open':
      return startAction(world, kind, true) ? 'canceled' : 'rejected';
    case 'notYet':
      mech.buffered = { action: kind, at: world.time };
      return 'buffered';
    case 'closed':
      pushEvent(world, 'reject', 'キャンセル不可');
      return 'rejected';
  }
}

function spawnProjectiles(world: SimWorld, def: ActionDef): void {
  const spec = def.projectile;
  if (!spec) return;
  const { mech } = world;
  const muzzle: Vec3 = { x: mech.pos.x, y: mech.pos.y + 1.8, z: mech.pos.z };
  spawnEffect(world, 'muzzle', {
    x: muzzle.x + Math.sin(mech.yaw) * 1.6,
    y: muzzle.y - 0.6,
    z: muzzle.z + Math.cos(mech.yaw) * 1.6,
  });
  const target = world.enemy.pos;
  const dx = target.x - muzzle.x;
  const dy = target.y + 1.5 - muzzle.y;
  const dz = target.z - muzzle.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const baseYaw = Math.atan2(dx, dz);
  const pitch = Math.asin(dy / len);

  for (let i = 0; i < spec.count; i++) {
    const offset = spec.count === 1 ? 0 : (i / (spec.count - 1) - 0.5) * 2 * spec.spread;
    const yaw = baseYaw + offset;
    const horizontal = Math.cos(pitch) * spec.speed;
    const projectile: Projectile = {
      id: world.nextProjectileId++,
      kind: spec.kind,
      pos: { ...muzzle },
      vel: { x: Math.sin(yaw) * horizontal, y: Math.sin(pitch) * spec.speed, z: Math.cos(yaw) * horizontal },
      life: spec.life,
      radius: spec.radius,
      homing: spec.homing,
    };
    world.projectiles.push(projectile);
  }
}

function hitEnemy(world: SimWorld): void {
  world.enemy.hitFlash = HIT_FLASH_S;
  world.enemy.hitCount += 1;
  spawnEffect(world, 'hit', { x: world.enemy.pos.x, y: world.enemy.pos.y + 1.6, z: world.enemy.pos.z });
}

function stepAction(world: SimWorld, dt: number): void {
  const { mech } = world;
  if (mech.action === 'idle') return;
  const def = ACTIONS[mech.action];
  mech.actionTime += dt;

  if (def.boostPerSec > 0) {
    mech.boost -= def.boostPerSec * dt;
    if (mech.boost <= 0) {
      mech.boost = 0;
      mech.overheat = true;
      mech.action = 'idle';
      return;
    }
  }

  const { dx, dz, distance } = towardEnemy(world);
  if (def.move === 'dash' && def.speed !== undefined) {
    mech.vel.x = dx * def.speed;
    mech.vel.z = dz * def.speed;
    mech.vel.y = 0;
  } else if (def.move === 'lunge' && def.speed !== undefined) {
    const lunging = mech.actionTime < (def.lungeTime ?? def.duration) && distance > MELEE_REACH;
    mech.vel.x = lunging ? dx * def.speed : 0;
    mech.vel.z = lunging ? dz * def.speed : 0;
    mech.vel.y = 0;
    // 届いたら攻撃判定を前倒しする
    if (!lunging && !mech.actionFired && def.fireAt !== undefined) mech.actionTime = Math.max(mech.actionTime, def.fireAt);
  }

  if (!mech.actionFired && def.fireAt !== undefined && mech.actionTime >= def.fireAt) {
    mech.actionFired = true;
    spawnProjectiles(world, def);
    if (def.strike) {
      spawnEffect(world, 'slash', {
        x: mech.pos.x + Math.sin(mech.yaw) * 1.5,
        y: mech.pos.y + 1.8,
        z: mech.pos.z + Math.cos(mech.yaw) * 1.5,
      });
      if (towardEnemy(world).distance <= MELEE_HIT_RANGE) hitEnemy(world);
    }
  }

  // 受付前に来ていた入力を、受付が始まった時点で出す
  const buffered = mech.buffered;
  if (buffered !== null) {
    if (world.time - buffered.at > INPUT_BUFFER_S) {
      mech.buffered = null;
    } else if (cancelState(mech, buffered.action) === 'open') {
      startAction(world, buffered.action, true);
      return;
    }
  }

  if (mech.actionTime >= def.duration) {
    mech.action = 'idle';
    mech.meleeStage = 0;
    mech.buffered = null;
  }
}

function stepMechPhysics(world: SimWorld, dt: number): void {
  const { mech } = world;
  const move = mech.action === 'idle' ? 'free' : ACTIONS[mech.action].move;

  if (move === 'free' || move === 'halt') {
    const gravityScale = move === 'halt' && !mech.grounded ? 0.3 : 1;
    mech.vel.y -= GRAVITY * gravityScale * dt;
    const damping = mech.grounded || move === 'halt' ? 10 : 1.5;
    const keep = Math.exp(-damping * dt);
    mech.vel.x *= keep;
    mech.vel.z *= keep;
  }

  mech.pos.x += mech.vel.x * dt;
  mech.pos.y += mech.vel.y * dt;
  mech.pos.z += mech.vel.z * dt;

  if (mech.pos.y <= 0) {
    mech.pos.y = 0;
    if (!mech.grounded && mech.vel.y <= 0) {
      mech.grounded = true;
      mech.landingLag = LANDING_LAG_S;
      mech.action = 'idle';
      mech.meleeStage = 0;
      mech.buffered = null;
      spawnEffect(world, 'land', mech.pos);
      mech.vel.x = 0;
      mech.vel.z = 0;
    }
    mech.vel.y = Math.max(mech.vel.y, 0);
  } else {
    mech.grounded = false;
  }

  // 地上でブーストを使って止まったときも、着地と同じ硬直を挟んで回復させる（地上 BD を使い切ったときなど）
  if (mech.grounded && mech.action === 'idle' && mech.landingLag === 0 && mech.boost < BOOST_MAX) {
    mech.landingLag = LANDING_LAG_S;
  }

  if (mech.landingLag > 0) {
    mech.landingLag -= dt;
    if (mech.landingLag <= 0) {
      mech.landingLag = 0;
      mech.boost = BOOST_MAX;
      mech.overheat = false;
    }
  }

  const { dx, dz } = towardEnemy(world);
  mech.yaw = Math.atan2(dx, dz);
}

function stepProjectiles(world: SimWorld, dt: number): void {
  const enemyCenter: Vec3 = { x: world.enemy.pos.x, y: world.enemy.pos.y + 1.5, z: world.enemy.pos.z };
  world.projectiles = world.projectiles.filter((p) => {
    if (p.homing > 0) {
      const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      const tx = enemyCenter.x - p.pos.x;
      const ty = enemyCenter.y - p.pos.y;
      const tz = enemyCenter.z - p.pos.z;
      const tlen = Math.hypot(tx, ty, tz) || 1;
      const blend = Math.min(1, p.homing * dt);
      const nx = p.vel.x / speed + (tx / tlen - p.vel.x / speed) * blend;
      const ny = p.vel.y / speed + (ty / tlen - p.vel.y / speed) * blend;
      const nz = p.vel.z / speed + (tz / tlen - p.vel.z / speed) * blend;
      const nlen = Math.hypot(nx, ny, nz) || 1;
      p.vel = { x: (nx / nlen) * speed, y: (ny / nlen) * speed, z: (nz / nlen) * speed };
    }
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;
    p.life -= dt;

    const distance = Math.hypot(p.pos.x - enemyCenter.x, p.pos.y - enemyCenter.y, p.pos.z - enemyCenter.z);
    if (distance <= ENEMY_HIT_RADIUS + p.radius) {
      hitEnemy(world);
      return false;
    }
    return p.life > 0;
  });
}

function stepEffects(world: SimWorld, dt: number): void {
  for (const e of world.effects) e.age += dt;
  world.effects = world.effects.filter((e) => e.age < e.life);
}

export function stepWorld(world: SimWorld, dt: number): void {
  world.time += dt;
  stepEffects(world, dt);
  world.enemy.pos.x = ENEMY_BASE.x + Math.sin(world.time * ENEMY_SWAY_SPEED) * ENEMY_SWAY;
  world.enemy.hitFlash = Math.max(0, world.enemy.hitFlash - dt);

  stepAction(world, dt);
  stepMechPhysics(world, dt);
  stepProjectiles(world, dt);
}

/** 描画フレームの間隔がばらついても挙動が変わらないよう、固定刻みで進める */
export const FIXED_DT = 1 / 120;

/** タブ復帰などで一度に大きく進めすぎないための上限。低フレームレートでも速度は保てる長さにする */
const MAX_ADVANCE_S = 1;

export function advanceWorld(world: SimWorld, elapsed: number, carry: number): number {
  let remaining = Math.min(elapsed, MAX_ADVANCE_S) + carry;
  while (remaining >= FIXED_DT) {
    stepWorld(world, FIXED_DT);
    remaining -= FIXED_DT;
  }
  return remaining;
}
