import type { ArcadeRawInput } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';
import {
  AIR_BOOST_FREE_USES,
  AIR_DRIFT_SPEED,
  BD_LIFT_HEIGHT,
  BD_LIFT_SPEED,
  BD_TURN_RATE,
  BOOST_MAX,
  FACE_TURN_RATE,
  GRAVITY,
  GUARD_BLOCK_HOLD_S,
  GUARD_HOLD_BOOST_PER_SEC,
  GUARD_HOLD_MAX_S,
  GUARD_INPUT_WINDOW_S,
  GUARD_QUEUE_S,
  GUARD_RECOVER_AMOUNT,
  GUARD_RECOVER_BELOW,
  INERTIA_AIR_DAMPING,
  INERTIA_HELD_SCALE,
  INERTIA_JUMP_SPEED,
  INERTIA_LEVER_ACCEL,
  INERTIA_LEVER_WINDOW_S,
  CHAIN_GRACE_S,
  JUMP_HOLD_S,
  BD_FROM_JUMP_WINDOW_S,
  SHOT_AFTER_BD_GRAVITY_SCALE,
  INERTIA_MAX_SPEED,
  LANDING_LAG_MAX_S,
  LANDING_LAG_PER_USE_S,
  LANDING_LAG_S,
  MELEE_HIT_RANGE,
  MELEE_REACH,
  SLIDE_SPEED,
  SLIDE_WINDOW_S,
  STEP_TAP_WINDOW_S,
  TURN_SHOT_ANGLE,
  TURN_SHOT_DELAY_S,
  WALK_SPEED,
  type ActionDef,
  type AssistKind,
  type MoveMode,
  type ProjectileSpec,
} from './actions';
import { cancelState, INPUT_BUFFER_S, routeName } from './cancel';
import type {
  EffectKind,
  InputResult,
  LeverDirection,
  MechAction,
  MechState,
  Projectile,
  SimWorld,
  Vec3,
} from './types';
import { chargeTimeOf, GENERIC_UNIT, isRejection, unitById, type LeverKind, type UnitDef } from './units';

/**
 * 機体のシミュレーション。毎フレーム呼ぶので、world はコピーせずその場で書き換える。
 *
 * 入力はまずスロット（射撃・格闘・サブ……）になり、機体データ（units.ts）がレバーの入れ方や状態から
 * 実際に出す技を決める。行動中の入力はキャンセルルートに従って、出す・受付まで待たせる・捨てるを決める。
 * EXVS の移動テクニック（慣性ジャンプ・フワステ・BD 旋回・振り向き撃ち・アメキャン・滑り特射・
 * 誘導切り・盾など）は、行動の始め方と毎フレームの動かし方で再現する。
 */

/** 敵は左右にゆっくり動き、ロックオンで機体の向きが追従するのを見せる */
const ENEMY_BASE: Vec3 = { x: 0, y: 0, z: -40 };
const ENEMY_SWAY = 12;
const ENEMY_SWAY_SPEED = 0.4;
const ENEMY_HIT_RADIUS = 2.5;
const MECH_HIT_RADIUS = 1.6;
const HIT_FLASH_S = 0.3;
/** 敵の射撃の間隔と弾の性能。誘導はステップで切れる */
export const ENEMY_FIRE_INTERVAL_S = 2.8;
const ENEMY_BEAM = { speed: 70, radius: 0.25, life: 2.5, homing: 1.6 };

const EVENT_LIMIT = 8;
const EFFECT_LIFE: Readonly<Record<EffectKind, number>> = { hit: 0.35, muzzle: 0.12, land: 0.4, slash: 0.25, guard: 0.3 };

/** アシストの持続と動き */
const ASSIST_LIFE: Readonly<Record<AssistKind, number>> = {
  murasame: 6,
  'freedom-shot': 1.3,
  'freedom-melee': 2.2,
  ootori: 3,
  esbit: 15,
  'gfred-shot': 1.4,
  'gfred-melee': 2.2,
};
const ASSIST_BEAM: ProjectileSpec = { kind: 'assist-beam', speed: 110, radius: 0.18, life: 1.2, homing: 0.6, count: 1, spread: 0 };
/** メイン射撃などに連動して撃つ追従アシストと、その弾 */
const LINKED_ASSIST_SHOTS: Partial<Readonly<Record<AssistKind, ProjectileSpec>>> = {
  murasame: ASSIST_BEAM,
  esbit: { kind: 'assist-beam', speed: 100, radius: 0.18, life: 1.2, homing: 0.5, count: 1, spread: 0 },
};
const FREEDOM_BEAM: ProjectileSpec = { kind: 'big-beam', speed: 110, radius: 0.5, life: 1.2, homing: 0.7, count: 2, spread: 0.08 };
const GFRED_BEAM: ProjectileSpec = { kind: 'beam', speed: 120, radius: 0.18, life: 1.2, homing: 0.6, count: 1, spread: 0 };
const GFRED_BIG_BEAM: ProjectileSpec = { kind: 'big-beam', speed: 120, radius: 0.4, life: 1.2, homing: 0.6, count: 1, spread: 0 };
const OOTORI_SHOT: ProjectileSpec = { kind: 'rail', speed: 150, radius: 0.25, life: 1, homing: 0.5, count: 1, spread: 0 };

/**
 * 解釈済み入力からスロットへ。ジャンプはボタンを押した瞬間に上昇を始め、押している間だけ続けるため、
 * 解釈済みの 'jump'（離したあとや BD 判定待ちのあとに届く）ではなく生入力で扱う。
 */
const INPUT_TO_SLOT: Partial<Record<ButtonType, MechAction>> = {
  shot: 'shot',
  melee: 'melee',
  bd: 'bd',
  sub: 'sub',
  'special-shot': 'special-shot',
  'special-melee': 'special-melee',
  'shot-charge-end': 'shot-cs',
  'melee-charge-end': 'melee-cs',
};

export type CreateWorldOptions = {
  /** 敵が撃ち返してくるか（誘導切りの練習用） */
  enemyFires?: boolean;
  /** 使う機体。省略時は汎用機 */
  unitId?: string;
  /** 敵が左右に動くか（省略時は動く） */
  enemyMoves?: boolean;
};

export function createWorld({
  enemyFires = false,
  unitId = GENERIC_UNIT.id,
  enemyMoves = true,
}: CreateWorldOptions = {}): SimWorld {
  const unit = unitById(unitId);
  const ammo: SimWorld['mech']['ammo'] = {};
  for (const [key, def] of Object.entries(unit.ammo)) ammo[key] = { count: def.max, timer: 0 };
  return {
    time: 0,
    unitId: unit.id,
    mech: {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: Math.PI,
      lockYaw: Math.PI,
      boost: BOOST_MAX,
      overheat: false,
      grounded: true,
      landingLag: 0,
      action: 'idle',
      move: null,
      chainLabels: [],
      actionTime: 0,
      actionFired: false,
      charging: { shot: false, melee: false },
      chargeSince: { shot: null, melee: null },
      meleeStage: 0,
      buffered: null,
      chain: [],
      jumpHeld: false,
      leverHeld: [],
      lastLeverTap: null,
      stepDir: null,
      bdDir: null,
      inertiaAvailable: false,
      carryInertia: false,
      turnShot: false,
      sliding: false,
      airBoostUses: 0,
      hitFlash: 0,
      ammo,
      seedTime: 0,
      seedCooldown: 0,
      packOut: false,
      shotsFired: 0,
      curveSign: 0,
      bdLever: null,
      leverNeutralSinceBd: false,
      lastLeverPress: null,
      inertiaPending: null,
      inertiaFlight: false,
      chainGraceUntil: null,
      jumpPress: null,
      guardQueuedAt: null,
      backReleasedAt: null,
      guardBlockUntil: null,
    },
    enemy: {
      pos: { ...ENEMY_BASE },
      moves: enemyMoves,
      swayTime: 0,
      fireInterval: enemyFires ? ENEMY_FIRE_INTERVAL_S : 0,
      fireTimer: ENEMY_FIRE_INTERVAL_S,
      hitFlash: 0,
      hitCount: 0,
    },
    projectiles: [],
    nextProjectileId: 1,
    assists: [],
    nextAssistId: 1,
    events: [],
    nextEventId: 1,
    effects: [],
    nextEffectId: 1,
    mechHits: 0,
  };
}

function unitOf(world: SimWorld): UnitDef {
  return unitById(world.unitId);
}

// ---- 向きとレバー ----

type Dir2 = { x: number; z: number };

function yawOf(dir: Dir2): number {
  return Math.atan2(dir.x, dir.z);
}

function dirOfYaw(yaw: number): Dir2 {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** a から b への角度差（-π〜π） */
function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(current, target);
  return Math.abs(d) <= maxStep ? target : current + Math.sign(d) * maxStep;
}

/** 機体から敵への水平方向の単位ベクトルと距離 */
function towardEnemy(world: SimWorld): { dx: number; dz: number; distance: number } {
  const dx = world.enemy.pos.x - world.mech.pos.x;
  const dz = world.enemy.pos.z - world.mech.pos.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return { dx: 0, dz: -1, distance: 0 };
  return { dx: dx / distance, dz: dz / distance, distance };
}

const LEVER_VECTORS: Readonly<Record<LeverDirection, { x: number; y: number }>> = {
  forward: { x: 0, y: 1 },
  back: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * レバー入力をワールド座標の水平方向に直す。前は敵の方向、右は画面の右。
 * 倒していなければ null。
 */
function leverToWorld(world: SimWorld, directions: ReadonlyArray<LeverDirection>): Dir2 | null {
  let lx = 0;
  let ly = 0;
  for (const d of directions) {
    lx += LEVER_VECTORS[d].x;
    ly += LEVER_VECTORS[d].y;
  }
  const len = Math.hypot(lx, ly);
  if (len < 1e-6) return null;
  const { dx, dz } = towardEnemy(world);
  // 敵の方を向いたときの右は (-dz, dx)
  return { x: (dx * ly + -dz * lx) / len, z: (dz * ly + dx * lx) / len };
}

/** 技の出し分けに使うレバーの入れ方。後ろ＞横＞前の順で優先する */
function leverKind(held: ReadonlyArray<LeverDirection>): LeverKind {
  if (held.includes('back')) return 'back';
  if (held.includes('left') || held.includes('right')) return 'side';
  if (held.includes('forward')) return 'front';
  return 'N';
}

/** 横方向のレバー（右なら 1、左なら -1、なければ 0） */
function sideSign(held: ReadonlyArray<LeverDirection>): number {
  if (held.includes('right')) return 1;
  if (held.includes('left')) return -1;
  return 0;
}

function horizontalSpeed(mech: MechState): number {
  return Math.hypot(mech.vel.x, mech.vel.z);
}

function moveModeOf(mech: MechState): MoveMode {
  if (mech.action === 'idle' || mech.move === null) return 'free';
  if (mech.action === 'shot' && mech.turnShot) return 'halt';
  return mech.move.move;
}

function seedActive(mech: MechState): boolean {
  return mech.seedTime > 0;
}

function boostScaleOf(world: SimWorld): number {
  const unit = unitOf(world);
  return seedActive(world.mech) ? (unit.seedBoostScale ?? unit.boostScale) : unit.boostScale;
}

function speedScaleOf(world: SimWorld): number {
  return seedActive(world.mech) ? (unitOf(world).seedSpeedScale ?? 1) : 1;
}

// ---- 出来事と効果 ----

function pushEvent(world: SimWorld, kind: 'route' | 'reject', label: string): void {
  world.events.push({ id: world.nextEventId++, kind, label, time: world.time });
  if (world.events.length > EVENT_LIMIT) world.events.splice(0, world.events.length - EVENT_LIMIT);
}

function spawnEffect(world: SimWorld, kind: EffectKind, pos: Vec3): void {
  world.effects.push({ id: world.nextEffectId++, kind, pos: { ...pos }, age: 0, life: EFFECT_LIFE[kind] });
}

// ---- 技の決定と開始 ----

/** スロットとレバーと状態から、この機体が実際に出す技を決める */
function resolveMove(world: SimWorld, slot: MechAction): ActionDef | { reject: string } {
  const mech = world.mech;
  const unit = unitOf(world);
  if (slot === 'guard' && !unit.shieldGuard) return { reject: '盾なし' };
  return unit.resolve(slot, {
    lever: leverKind(mech.leverHeld),
    inBd: mech.action === 'bd',
    seed: seedActive(mech),
    packOut: mech.packOut,
    seedCooldown: mech.seedCooldown,
    assists: [...new Set(world.assists.map((a) => a.kind))],
    current: mech.move,
    currentSlot: mech.action,
  });
}

/** 行動を終えて止まる。BD・ステップの終わりは、次のジャンプに慣性を乗せられる */
/**
 * 行動が最後まで出て終わった。BD・ステップのあとは少しのあいだ、次の行動を連携（ズンダなど）としてつなぐ。
 * 射撃ボタンは離してから届くので、BD を離した直後に押した射撃は BD が終わってから始まることがある
 */
function finishAction(world: SimWorld): void {
  const mech = world.mech;
  if (mech.action === 'bd' || mech.action === 'step') mech.chainGraceUntil = world.time + CHAIN_GRACE_S;
  endAction(mech);
}

function endAction(mech: MechState): void {
  if (mech.action === 'bd' || mech.action === 'step') {
    mech.inertiaAvailable = true;
    if (mech.action === 'bd') mech.leverNeutralSinceBd ||= mech.leverHeld.length === 0;
  }
  mech.action = 'idle';
  mech.move = null;
  mech.meleeStage = 0;
  mech.buffered = null;
  mech.stepDir = null;
  mech.bdDir = null;
  mech.turnShot = false;
  mech.sliding = false;
  mech.carryInertia = false;
  mech.shotsFired = 0;
  mech.curveSign = 0;
}

/**
 * 慣性ジャンプを成立させる。レバーの方向へ大きく流れる。
 * held はレバーを戻さず入れっぱなしで出したとき。飛距離が少し短くなる。
 */
function establishInertiaJump(world: SimWorld, direction: LeverDirection, held = false): void {
  const mech = world.mech;
  const dir = leverToWorld(world, [direction]);
  if (!dir) return;
  const speed = INERTIA_JUMP_SPEED * (held ? INERTIA_HELD_SCALE : 1);
  mech.vel.x = dir.x * speed;
  mech.vel.z = dir.z * speed;
  mech.carryInertia = true;
  mech.inertiaFlight = true;
  mech.inertiaPending = null;
  pushEvent(world, 'route', held ? '慣性ジャンプ（入れっぱ）' : '慣性ジャンプ');
}

/**
 * ジャンプの直後に BD が届いたら、そのジャンプで成立した慣性ジャンプを取り消す。
 * BD の 1 回目の押下はジャンプとして届くので、BD のつもりの入力が慣性ジャンプと表示されてしまう
 */
function cancelInertiaJump(world: SimWorld): void {
  const mech = world.mech;
  mech.inertiaPending = null;
  if (!mech.inertiaFlight) return;
  mech.inertiaFlight = false;
  mech.carryInertia = false;
  for (let i = world.events.length - 1; i >= 0; i--) {
    const e = world.events[i];
    if (e.kind === 'route' && e.label.startsWith('慣性ジャンプ')) {
      world.events.splice(i, 1);
      break;
    }
  }
}

/** 行動を始める（キャンセルかどうかの判定は済んでいる前提）。ブーストが足りなければ false */
function startAction(world: SimWorld, kind: MechAction, def: ActionDef, canceled: boolean, quiet = false): boolean {
  const mech = world.mech;
  const usesBoost = def.boostCost > 0 || def.boostPerSec > 0;
  if (usesBoost && mech.overheat) {
    if (!quiet) pushEvent(world, 'reject', 'OVERHEAT');
    return false;
  }

  const previous = mech.action;
  const previousMove = mech.move;
  const previousTime = mech.actionTime;
  const previousFired = mech.actionFired;
  const previousTurnShot = mech.turnShot;
  // BD・ステップが終わってすぐなら、終わる前に出したのと同じく連携としてつなぐ
  const linked =
    canceled || (previous === 'idle' && mech.chainGraceUntil !== null && world.time <= mech.chainGraceUntil);
  mech.chainGraceUntil = null;
  // 盾の先行入力は、ほかの行動を出したら捨てる
  mech.guardQueuedAt = null;
  mech.guardBlockUntil = null;
  const lever = leverToWorld(world, mech.leverHeld);
  let technique: string | null = null;

  mech.boost -= def.boostCost * boostScaleOf(world);
  if (mech.boost <= 0) {
    mech.boost = 0;
    mech.overheat = true;
  }
  if (def.ammo) {
    const ammo = mech.ammo[def.ammo];
    if (ammo) ammo.count -= def.ammoCost ?? 1;
  }

  const comboMelee =
    canceled && (kind === 'melee' || kind === 'special-melee') && kind === previous && def.id === previousMove?.id;
  mech.meleeStage = kind === 'melee' || kind === 'special-melee' ? (comboMelee ? mech.meleeStage + 1 : 1) : 0;
  // BD はジャンプの 2 回目の押下で届くので、ジャンプからの BD はキャンセルではなく BD の出だしとして扱う
  const bdFromJump = kind === 'bd' && previous === 'jump';
  let namedCancel = linked;
  if (bdFromJump) {
    const before = mech.chain.slice(0, -1);
    mech.chain = [...before, kind];
    mech.chainLabels = [...mech.chainLabels.slice(0, -1), def.label];
    // ジャンプ中の BD はただの BD。何かの行動からつないだときだけ BDC と呼ぶ
    namedCancel = before.length > 0 && before[before.length - 1] !== 'jump';
    if (previousTime <= BD_FROM_JUMP_WINDOW_S) cancelInertiaJump(world);
  } else {
    mech.chain = linked ? [...mech.chain, kind] : [kind];
    mech.chainLabels = linked ? [...mech.chainLabels, def.label] : [def.label];
  }
  if ((kind === 'jump' || kind === 'bd' || kind === 'step') && !bdFromJump) mech.airBoostUses += 1;

  // 前の行動の名残を消してから、今の行動の準備をする
  if (previous === 'bd' || previous === 'step') {
    mech.inertiaAvailable = true;
    if (previous === 'bd') mech.leverNeutralSinceBd ||= mech.leverHeld.length === 0;
  }
  mech.action = kind;
  mech.move = def;
  mech.actionFired = false;
  mech.shotsFired = 0;
  mech.buffered = null;
  mech.turnShot = false;
  mech.sliding = false;
  mech.carryInertia = false;
  mech.curveSign = def.curve ? sideSign(mech.leverHeld) || 1 : 0;
  if (kind !== 'step' && def.move !== 'roll') mech.stepDir = null;
  if (kind !== 'bd') mech.bdDir = null;
  // 格闘の 2 段目以降は踏み込みを省いてすぐ振る
  mech.actionTime = comboMelee && def.fireAt !== undefined ? Math.max(0, def.fireAt - 0.2) : 0;

  switch (kind) {
    case 'jump': {
      if (previous === 'step' && mech.inertiaAvailable && horizontalSpeed(mech) > 3) {
        // フワステ: ステップの勢いのまま膨らむ
        mech.carryInertia = true;
        technique = 'フワステ';
      } else {
        // 慣性ジャンプ: BD でレバーを倒していた方向へ、一度戻してから入れ直すと成立する。
        // 戻さず入れっぱなしでも出るが飛距離が短い。レバーなしなら普通のジャンプ
        const direction = mech.bdLever;
        const press = mech.lastLeverPress;
        if (mech.inertiaAvailable && direction !== null) {
          if (mech.leverHeld.includes(direction)) {
            const reinput =
              mech.leverNeutralSinceBd &&
              press !== null &&
              press.direction === direction &&
              world.time - press.at <= INERTIA_LEVER_WINDOW_S;
            establishInertiaJump(world, direction, !reinput);
          } else if (mech.leverHeld.length === 0) {
            // ジャンプのあとに入れ直すのを待つ
            mech.inertiaPending = { direction, until: world.time + INERTIA_LEVER_WINDOW_S };
          }
        }
        if (!mech.carryInertia) {
          if (!mech.grounded && mech.vel.y < 0) technique = 'ふわふわ';
          mech.vel.x = 0;
          mech.vel.z = 0;
        }
      }
      mech.inertiaAvailable = false;
      mech.grounded = false;
      break;
    }
    case 'bd': {
      const { dx, dz } = towardEnemy(world);
      mech.bdDir = lever ?? { x: dx, z: dz };
      mech.bdLever = mech.leverHeld[mech.leverHeld.length - 1] ?? 'forward';
      mech.leverNeutralSinceBd = false;
      mech.inertiaFlight = false;
      // ステップ中のジャンプ 2 回押しは、1 回目がフワステとして届いてから BD になる
      const before = bdFromJump ? mech.chain[mech.chain.length - 2] : previous;
      if (before === 'step') technique = 'ステBD';
      break;
    }
    case 'step': {
      if (previous === 'shot' && !previousFired && previousMove) {
        // 移動撃ちの BR は撃ちながらステップする
        fireMove(world, previousMove);
        technique = '動き撃ちステップ';
      } else if (previous === 'bd') {
        technique = 'BDステ';
      }
      if (cutHoming(world) && technique === null) technique = '誘導切り';
      break;
    }
    case 'shot': {
      // 敵が機体の後ろ側にいると振り向き撃ちになり、足が止まって発射も遅れる
      mech.turnShot = Math.abs(angleDiff(mech.yaw, mech.lockYaw)) > TURN_SHOT_ANGLE;
      if (mech.turnShot) {
        mech.actionTime = -TURN_SHOT_DELAY_S;
        technique = '振り向き撃ち';
      } else if (canceled && (previousMove?.fallCancel || (previous === 'shot' && previousTurnShot))) {
        // 足の止まる行動を移動撃ちでキャンセルすると、上昇を打ち消して落ち始める
        mech.vel.y = Math.min(mech.vel.y, 0);
        technique = previousMove?.assist || previous === 'sub' ? 'アメキャン' : 'キャンセル落下';
      }
      break;
    }
    case 'guard':
      // 足を止めて構える。上昇の勢いも止め、空中ではゆっくり落ちる
      mech.vel.y = Math.min(mech.vel.y, 0);
      technique = '盾';
      break;
    case 'special-shot': {
      // ジャンプを押した直後にレバーを入れて特射を出すと、その方向へ大きく滑る
      if (previous === 'jump' && previousTime <= SLIDE_WINDOW_S && lever) {
        mech.sliding = true;
        mech.vel.x = lever.x * SLIDE_SPEED;
        mech.vel.z = lever.z * SLIDE_SPEED;
        mech.vel.y = Math.min(mech.vel.y, 2);
        technique = '滑り特射';
      }
      break;
    }
    default:
      break;
  }

  if (def.move === 'roll') {
    // 横はレバーの左右、入れていなければ右。前・後は敵へ向かう・離れる
    const { dx, dz } = towardEnemy(world);
    const dir = def.moveDir ?? 'side';
    const sign = sideSign(mech.leverHeld) || 1;
    mech.stepDir = dir === 'side' ? { x: -dz * sign, z: dx * sign } : dir === 'front' ? { x: dx, z: dz } : { x: -dx, z: -dz };
  }
  if (def.fallOnCancel && kind !== 'shot' && canceled && previousMove?.fallCancel) {
    // 足の止まる行動を追従アシストの射撃などでキャンセルすると、メインと同じく落ち始める
    mech.vel.y = Math.min(mech.vel.y, 0);
    technique = 'アサキャン';
  }
  if (def.riseSpeed !== undefined) {
    mech.vel.y = def.riseSpeed;
    mech.grounded = false;
  }
  if (def.move === 'dash' || def.move === 'lunge' || def.move === 'step' || def.move === 'roll') {
    // 空中で出しても高度を保つ
    mech.vel.y = 0;
  }

  const name = technique ?? routeName(mech.chain, mech.meleeStage, namedCancel);
  if (name !== null) pushEvent(world, 'route', name);
  return true;
}

/**
 * スロットの行動を出そうとする。技を決めてから、キャンセルルートに従って出す・受付まで待たせる・捨てるを決める。
 * quiet のときは出せなくても HUD に理由を出さない（BD の 1 回目のジャンプ押しなど、出せないのが普通の入力）。
 */
function requestAction(world: SimWorld, kind: MechAction, quiet = false): InputResult {
  const mech = world.mech;
  if (mech.landingLag > 0) {
    // 盾だけは硬直中の先行入力が効き、硬直が切れた瞬間に出る
    if (kind === 'guard' && !isRejection(resolveMove(world, kind))) {
      mech.guardQueuedAt = world.time;
      return 'buffered';
    }
    if (!quiet) pushEvent(world, 'reject', '着地硬直');
    return 'rejected';
  }

  const resolved = resolveMove(world, kind);
  if (isRejection(resolved)) {
    if (!quiet) pushEvent(world, 'reject', resolved.reject);
    return 'rejected';
  }
  const def = resolved;
  if (def.ammo) {
    const ammo = mech.ammo[def.ammo];
    if (ammo && ammo.count < (def.ammoCost ?? 1)) {
      if (!quiet) pushEvent(world, 'reject', '弾切れ');
      return 'rejected';
    }
  }
  if (def.assist === 'murasame' && world.assists.some((a) => a.kind === 'murasame')) {
    if (!quiet) pushEvent(world, 'reject', 'ムラサメ展開中');
    return 'rejected';
  }
  if (def.assist === 'ootori' && mech.packOut) {
    if (!quiet) pushEvent(world, 'reject', 'オオトリ射出中');
    return 'rejected';
  }

  switch (cancelState(mech, kind, def)) {
    case 'free':
      return startAction(world, kind, def, false, quiet) ? 'started' : 'rejected';
    case 'open':
      return startAction(world, kind, def, true, quiet) ? 'canceled' : 'rejected';
    case 'notYet':
      if (quiet) return 'rejected';
      mech.buffered = { action: kind, move: def, at: world.time };
      return 'buffered';
    case 'closed':
      if (kind === 'guard') {
        // 技の硬直中に入れた盾は、技が終わったら出る（先行入力盾）
        mech.guardQueuedAt = world.time;
        return 'buffered';
      }
      if (!quiet) pushEvent(world, 'reject', 'キャンセル不可');
      return 'rejected';
  }
}

const CHARGE_KIND: Partial<Record<ButtonType, 'shot' | 'melee'>> = {
  'shot-charge-start': 'shot',
  'shot-charge-end': 'shot',
  'melee-charge-start': 'melee',
  'melee-charge-end': 'melee',
};

/** チャージの溜まり具合（0〜1）。溜めていなければ 0 */
export function chargeRatio(world: SimWorld, kind: 'shot' | 'melee'): number {
  const since = world.mech.chargeSince[kind];
  if (since === null) return 0;
  return Math.min(1, (world.time - since) / chargeTimeOf(unitById(world.unitId), kind));
}

/**
 * 解釈済みの入力（射撃・格闘・BD・同時押し・チャージなど）を受ける。
 * チャージ開始は行動ではなく「溜めている」状態として持つ。
 */
export function applyInput(world: SimWorld, button: ButtonType): InputResult {
  const mech = world.mech;
  const chargeKind = CHARGE_KIND[button];
  if (chargeKind !== undefined) {
    if (button.endsWith('-start')) {
      mech.charging[chargeKind] = true;
      mech.chargeSince[chargeKind] = world.time;
      return 'started';
    }
    // 満タンになる前に離したら CS は出ない（溜めは捨てる）
    const full = chargeRatio(world, chargeKind) >= 1;
    mech.charging[chargeKind] = false;
    mech.chargeSince[chargeKind] = null;
    if (!full) {
      pushEvent(world, 'reject', 'チャージ不足');
      return 'rejected';
    }
  }

  if (button === 'jump') {
    // 短く 1 回だけ押したジャンプ。長押しでもう飛んでいれば何もしない
    const press = mech.jumpPress;
    if (press === null || press.started) return 'rejected';
    press.started = true;
    return requestAction(world, 'jump', true);
  }
  // BD になった押下は、もうジャンプにしない
  if (button === 'bd') mech.jumpPress = null;

  const kind = INPUT_TO_SLOT[button];
  if (kind === undefined) return 'rejected';
  return requestAction(world, kind);
}

/**
 * ボタンの生の押下・解放を受ける。ジャンプは少し押し続けたら上昇を始め（JUMP_HOLD_S）、押している間だけ続く。
 * 短い押下は BD の 1 回目かもしれないので、押した瞬間には飛ばない。
 */
export function applyRawInput(world: SimWorld, input: ArcadeRawInput): InputResult | null {
  if (input.button !== 'jump') return null;
  const mech = world.mech;
  if (input.phase !== 'down') {
    mech.jumpHeld = false;
    return null;
  }
  mech.jumpHeld = true;
  mech.jumpPress = { at: world.time, started: false };
  return null;
}

/** ジャンプボタンを押し続けていたら、ジャンプを始める */
function stepJumpPress(world: SimWorld): void {
  const mech = world.mech;
  const press = mech.jumpPress;
  if (press === null || press.started || !mech.jumpHeld) return;
  if (world.time - press.at < JUMP_HOLD_S) return;
  press.started = true;
  // BD の 1 回目の押下と同じく、出せなくても理由は出さない
  requestAction(world, 'jump', true);
}

/**
 * レバー（PC では十字キー）を倒す・戻す。同じ方向に素早く 2 回倒すとステップになる。
 * countTap を false にすると、倒した回数（ステップ判定）は数えない。タッチのスティックは
 * 斜めでも上下左右のどれか 1 方向として tapLever で別に数えるので、こちらでは数えない
 */
export function setLever(
  world: SimWorld,
  direction: LeverDirection,
  pressed: boolean,
  { countTap = true }: { countTap?: boolean } = {},
): InputResult | null {
  const mech = world.mech;
  if (!pressed) {
    if (direction === 'back' && mech.leverHeld.includes('back')) mech.backReleasedAt = world.time;
    mech.leverHeld = mech.leverHeld.filter((d) => d !== direction);
    // BD 中に戻しても数える。ジャンプは少し押し続けてから出るので、そのあいだに BD が終わることがある
    if (mech.leverHeld.length === 0 && (mech.inertiaAvailable || mech.action === 'bd')) mech.leverNeutralSinceBd = true;
    return null;
  }
  if (mech.leverHeld.includes(direction)) return null;
  mech.leverHeld = [...mech.leverHeld, direction];
  mech.lastLeverPress = { direction, at: world.time };

  // ジャンプを押した直後に、BD と同じ方向へ入れ直したら慣性ジャンプが成立する
  const pending = mech.inertiaPending;
  if (pending !== null && pending.direction === direction && world.time <= pending.until && mech.action === 'jump') {
    establishInertiaJump(world, direction);
    return null;
  }

  if (!countTap) return null;
  return tapLever(world, direction);
}

/**
 * レバーを 1 回倒したことを数える。同じ方向に STEP_TAP_WINDOW_S 以内で 2 回続けばステップを出す。
 * 後ろを戻してから GUARD_INPUT_WINDOW_S 以内に前へ倒すと盾を出す（後ろは長く倒していてもよい）。
 * そのあとの前はステップに数えない
 * （後ろ入力からの前ステは盾に化ける。MBON wiki「後入力からの最速前ステ」）
 */
export function tapLever(world: SimWorld, direction: LeverDirection): InputResult | null {
  const mech = world.mech;
  const tap = mech.lastLeverTap;
  const released = mech.backReleasedAt;
  if (
    direction === 'forward' &&
    tap?.direction === 'back' &&
    released !== null &&
    world.time - released <= GUARD_INPUT_WINDOW_S
  ) {
    mech.lastLeverTap = null;
    mech.backReleasedAt = null;
    return requestAction(world, 'guard');
  }
  if (tap !== null && tap.direction === direction && world.time - tap.at <= STEP_TAP_WINDOW_S) {
    mech.lastLeverTap = null;
    const previousStepDir = mech.stepDir;
    mech.stepDir = leverToWorld(world, [direction]);
    const result = requestAction(world, 'step');
    // 出せなかったら（受付待ちを含め）ステップの向きを戻す。受付待ちは出す時点の向きを使う
    if (result === 'rejected') mech.stepDir = previousStepDir;
    return result;
  }
  mech.lastLeverTap = { direction, at: world.time };
  return null;
}

// ---- 弾とアシスト ----

function aimAt(from: Vec3, target: Vec3, spec: ProjectileSpec, offset: number): Vec3 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dz = target.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const yaw = Math.atan2(dx, dz) + offset;
  const pitch = Math.asin(dy / len);
  const horizontal = Math.cos(pitch) * spec.speed;
  return { x: Math.sin(yaw) * horizontal, y: Math.sin(pitch) * spec.speed, z: Math.cos(yaw) * horizontal };
}

function shootSpec(world: SimWorld, from: Vec3, spec: ProjectileSpec, owner: 'mech' | 'enemy', target: Vec3): void {
  for (let i = 0; i < spec.count; i++) {
    const offset = spec.count === 1 ? 0 : (i / (spec.count - 1) - 0.5) * 2 * spec.spread;
    world.projectiles.push({
      id: world.nextProjectileId++,
      kind: spec.kind,
      owner,
      pos: { ...from },
      vel: aimAt(from, target, spec, offset),
      life: spec.life,
      radius: spec.radius,
      homing: spec.homing,
    });
  }
}

function enemyCenter(world: SimWorld): Vec3 {
  return { x: world.enemy.pos.x, y: world.enemy.pos.y + 1.5, z: world.enemy.pos.z };
}

/** 技の弾を 1 回分撃つ。メイン連動の追従アシストもここで撃つ */
function fireMove(world: SimWorld, def: ActionDef): void {
  const specs = def.projectiles ?? (def.projectile ? [def.projectile] : []);
  const { mech } = world;
  const target = enemyCenter(world);
  if (specs.length > 0) {
    const muzzle: Vec3 = { x: mech.pos.x, y: mech.pos.y + 1.8, z: mech.pos.z };
    spawnEffect(world, 'muzzle', {
      x: muzzle.x + Math.sin(mech.lockYaw) * 1.6,
      y: muzzle.y - 0.6,
      z: muzzle.z + Math.cos(mech.lockYaw) * 1.6,
    });
    for (const spec of specs) shootSpec(world, muzzle, spec, 'mech', target);
  }
  if (def.linkAssists) {
    for (const assist of world.assists) {
      const spec = LINKED_ASSIST_SHOTS[assist.kind];
      if (!spec) continue;
      shootSpec(world, { ...assist.pos }, spec, 'mech', target);
      assist.shots += 1;
    }
  }
}

function spawnAssist(world: SimWorld, kind: AssistKind): void {
  const { mech } = world;
  const make = (side: number) => {
    world.assists.push({
      id: world.nextAssistId++,
      kind,
      pos: { x: mech.pos.x, y: mech.pos.y + 2, z: mech.pos.z },
      yaw: mech.lockYaw,
      age: 0,
      life: ASSIST_LIFE[kind],
      side,
      shots: 0,
    });
  };
  if (kind === 'esbit') {
    // 2 基を左右に展開する。撃つのはメイン連動とサブの再入力のとき
    make(-1);
    make(1);
    return;
  }
  if (kind === 'murasame') {
    make(-1);
    make(1);
    // 呼び出したときにも撃つ
    for (const assist of world.assists.filter((a) => a.kind === 'murasame')) {
      shootSpec(world, assist.pos, ASSIST_BEAM, 'mech', enemyCenter(world));
    }
    return;
  }
  if (kind === 'ootori') mech.packOut = true;
  make(kind === 'freedom-shot' || kind === 'gfred-shot' ? -1 : 1);
}

function stepAssists(world: SimWorld, dt: number): void {
  const { mech } = world;
  const target = enemyCenter(world);
  const toEnemy = towardEnemy(world);
  for (const a of world.assists) {
    a.age += dt;
    const right = { x: -toEnemy.dz, z: toEnemy.dx };
    switch (a.kind) {
      case 'murasame': {
        // 機体の左右やや後ろに付いてくる
        const goal = {
          x: mech.pos.x + right.x * 3.2 * a.side - toEnemy.dx * 1.5,
          y: mech.pos.y + 2.4,
          z: mech.pos.z + right.z * 3.2 * a.side - toEnemy.dz * 1.5,
        };
        const k = Math.min(1, 8 * dt);
        a.pos.x += (goal.x - a.pos.x) * k;
        a.pos.y += (goal.y - a.pos.y) * k;
        a.pos.z += (goal.z - a.pos.z) * k;
        a.yaw = mech.lockYaw;
        break;
      }
      case 'esbit': {
        // 機体の左右すぐそばに浮かぶ
        const goal = {
          x: mech.pos.x + right.x * 1.8 * a.side,
          y: mech.pos.y + 2.6,
          z: mech.pos.z + right.z * 1.8 * a.side,
        };
        const k = Math.min(1, 10 * dt);
        a.pos.x += (goal.x - a.pos.x) * k;
        a.pos.y += (goal.y - a.pos.y) * k;
        a.pos.z += (goal.z - a.pos.z) * k;
        a.yaw = mech.lockYaw;
        break;
      }
      case 'gfred-shot': {
        // 機体の横に現れて、ライフルを片手で 2 射 → 両手で 1 射
        const goal = { x: mech.pos.x + right.x * 4 * a.side, y: mech.pos.y + 2, z: mech.pos.z + right.z * 4 * a.side };
        const k = Math.min(1, 10 * dt);
        a.pos.x += (goal.x - a.pos.x) * k;
        a.pos.y += (goal.y - a.pos.y) * k;
        a.pos.z += (goal.z - a.pos.z) * k;
        a.yaw = mech.lockYaw;
        const fireTimes = [0.3, 0.5, 0.9];
        if (a.shots < fireTimes.length && a.age >= fireTimes[a.shots]) {
          shootSpec(world, a.pos, a.shots < 2 ? GFRED_BEAM : GFRED_BIG_BEAM, 'mech', target);
          a.shots += 1;
        }
        break;
      }
      case 'freedom-shot': {
        // 機体の横に現れて、バラエーナを 2 連射する
        const goal = { x: mech.pos.x + right.x * 4 * a.side, y: mech.pos.y + 3, z: mech.pos.z + right.z * 4 * a.side };
        const k = Math.min(1, 10 * dt);
        a.pos.x += (goal.x - a.pos.x) * k;
        a.pos.y += (goal.y - a.pos.y) * k;
        a.pos.z += (goal.z - a.pos.z) * k;
        a.yaw = mech.lockYaw;
        const fireTimes = [0.35, 0.75];
        if (a.shots < fireTimes.length && a.age >= fireTimes[a.shots]) {
          shootSpec(world, a.pos, FREEDOM_BEAM, 'mech', target);
          a.shots += 1;
        }
        break;
      }
      case 'freedom-melee':
      case 'gfred-melee': {
        // 敵へ突っ込んで 3 回斬り、斬り抜ける
        const dx = target.x - a.pos.x;
        const dy = target.y - a.pos.y;
        const dz = target.z - a.pos.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        a.yaw = Math.atan2(dx, dz);
        if (dist > 3) {
          const speed = 48 * dt;
          a.pos.x += (dx / dist) * speed;
          a.pos.y += (dy / dist) * speed;
          a.pos.z += (dz / dist) * speed;
        } else if (a.shots < 3 && a.age >= 0.3 + a.shots * 0.22) {
          hitEnemy(world);
          a.shots += 1;
        }
        break;
      }
      case 'ootori': {
        // 敵へ飛んでビーム砲とレールガンを 2 回撃ち、機体へ戻ってくる
        const outbound = a.age < 1.2;
        const goal = outbound
          ? { x: target.x - toEnemy.dx * 12, y: target.y + 4, z: target.z - toEnemy.dz * 12 }
          : { x: mech.pos.x, y: mech.pos.y + 2, z: mech.pos.z };
        const dx = goal.x - a.pos.x;
        const dy = goal.y - a.pos.y;
        const dz = goal.z - a.pos.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        const step = Math.min(dist, (outbound ? 45 : 55) * dt);
        a.pos.x += (dx / dist) * step;
        a.pos.y += (dy / dist) * step;
        a.pos.z += (dz / dist) * step;
        a.yaw = Math.atan2(dx, dz);
        const fireTimes = [0.6, 0.95];
        if (a.shots < fireTimes.length && a.age >= fireTimes[a.shots]) {
          shootSpec(world, a.pos, OOTORI_SHOT, 'mech', target);
          shootSpec(world, a.pos, { ...OOTORI_SHOT, kind: 'big-beam', speed: 110, radius: 0.45 }, 'mech', target);
          a.shots += 1;
        }
        if (!outbound && dist < 1.5) a.age = a.life;
        break;
      }
    }
  }
  const before = world.assists.length;
  world.assists = world.assists.filter((a) => a.age < a.life);
  if (before !== world.assists.length && !world.assists.some((a) => a.kind === 'ootori')) mech.packOut = false;
}

function spawnEnemyBeam(world: SimWorld): void {
  const from: Vec3 = { x: world.enemy.pos.x, y: world.enemy.pos.y + 1.8, z: world.enemy.pos.z };
  const { mech } = world;
  const dx = mech.pos.x - from.x;
  const dy = mech.pos.y + 1.5 - from.y;
  const dz = mech.pos.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  world.projectiles.push({
    id: world.nextProjectileId++,
    kind: 'enemy-beam',
    owner: 'enemy',
    pos: from,
    vel: { x: (dx / len) * ENEMY_BEAM.speed, y: (dy / len) * ENEMY_BEAM.speed, z: (dz / len) * ENEMY_BEAM.speed },
    life: ENEMY_BEAM.life,
    radius: ENEMY_BEAM.radius,
    homing: ENEMY_BEAM.homing,
  });
}

/** ステップで、飛んできている敵の弾の誘導を切る。切った弾があれば true */
function cutHoming(world: SimWorld): boolean {
  let cut = false;
  for (const p of world.projectiles) {
    if (p.owner === 'enemy' && p.homing > 0) {
      p.homing = 0;
      cut = true;
    }
  }
  return cut;
}

function hitEnemy(world: SimWorld): void {
  world.enemy.hitFlash = HIT_FLASH_S;
  world.enemy.hitCount += 1;
  spawnEffect(world, 'hit', { x: world.enemy.pos.x, y: world.enemy.pos.y + 1.6, z: world.enemy.pos.z });
}

function hitMech(world: SimWorld): void {
  world.mech.hitFlash = HIT_FLASH_S;
  world.mechHits += 1;
  spawnEffect(world, 'hit', { x: world.mech.pos.x, y: world.mech.pos.y + 1.5, z: world.mech.pos.z });
}

// ---- 毎フレームの処理 ----

function stepAction(world: SimWorld, dt: number): void {
  const { mech } = world;
  if (mech.inertiaPending !== null && world.time > mech.inertiaPending.until) mech.inertiaPending = null;
  if (mech.action === 'idle' || mech.move === null) return;
  const def = mech.move;
  mech.actionTime += dt;

  if (def.boostPerSec > 0) {
    mech.boost -= def.boostPerSec * boostScaleOf(world) * dt;
    if (mech.boost <= 0) {
      mech.boost = 0;
      mech.overheat = true;
      endAction(mech);
      return;
    }
  }

  // ジャンプと BD はボタンを離したら終わる（最低限の長さは出す）
  if (def.holdMinTime !== undefined && !mech.jumpHeld && mech.actionTime >= def.holdMinTime) {
    finishAction(world);
    return;
  }

  const { dx, dz, distance } = towardEnemy(world);
  const lever = leverToWorld(world, mech.leverHeld);
  const speedScale = speedScaleOf(world);
  if (def.move === 'dash' && def.speed !== undefined) {
    // レバーの方向へ少しずつ曲がる（BD 旋回）
    const heading = mech.bdDir ?? { x: dx, z: dz };
    const yaw = lever ? turnToward(yawOf(heading), yawOf(lever), BD_TURN_RATE * dt) : yawOf(heading);
    mech.bdDir = dirOfYaw(yaw);
    if (mech.leverHeld.length > 0) mech.bdLever = mech.leverHeld[mech.leverHeld.length - 1];
    mech.vel.x = mech.bdDir.x * def.speed * speedScale;
    mech.vel.z = mech.bdDir.z * def.speed * speedScale;
    // 地上から出した BD は少し浮き上がり、そのあとは高度を保つ
    mech.vel.y = mech.pos.y < BD_LIFT_HEIGHT ? BD_LIFT_SPEED : 0;
  } else if (def.move === 'rise' && def.speed !== undefined) {
    mech.vel.y = def.speed;
    if (mech.carryInertia) {
      // 慣性はほぼそのまま残り、慣性の方向にレバーを入れるとさらに伸びる
      if (lever) {
        mech.vel.x += lever.x * INERTIA_LEVER_ACCEL * dt;
        mech.vel.z += lever.z * INERTIA_LEVER_ACCEL * dt;
      }
      const speed = horizontalSpeed(mech);
      const keep = Math.exp(-0.3 * dt) * (speed > INERTIA_MAX_SPEED ? INERTIA_MAX_SPEED / speed : 1);
      mech.vel.x *= keep;
      mech.vel.z *= keep;
    } else {
      mech.vel.x = lever ? lever.x * AIR_DRIFT_SPEED : mech.vel.x * 0.98;
      mech.vel.z = lever ? lever.z * AIR_DRIFT_SPEED : mech.vel.z * 0.98;
    }
  } else if ((def.move === 'step' || def.move === 'roll') && def.speed !== undefined) {
    // 出だしが最も速く、終わりにかけて減速する
    const dir = mech.stepDir ?? { x: dx, z: dz };
    const speed = def.speed * speedScale * (1 - (mech.actionTime / def.duration) * (def.move === 'roll' ? 0.9 : 0.6));
    mech.vel.x = dir.x * speed;
    mech.vel.z = dir.z * speed;
    mech.vel.y = 0;
  } else if (def.move === 'lunge' && def.speed !== undefined) {
    const lunging = mech.actionTime < (def.lungeTime ?? def.duration) && distance > MELEE_REACH;
    // 横格闘は回り込みながら踏み込む
    const curve = lunging && def.curve ? def.curve * mech.curveSign : 0;
    mech.vel.x = lunging ? dx * def.speed + -dz * curve : 0;
    mech.vel.z = lunging ? dz * def.speed + dx * curve : 0;
    mech.vel.y = 0;
    // 届いたら攻撃判定を前倒しする
    if (!lunging && !mech.actionFired && def.fireAt !== undefined) mech.actionTime = Math.max(mech.actionTime, def.fireAt);
  }

  if (def.fireAt !== undefined && mech.actionTime >= def.fireAt) {
    const volley = def.volley ?? { count: 1, interval: 0 };
    while (mech.shotsFired < volley.count && mech.actionTime >= def.fireAt + mech.shotsFired * volley.interval) {
      if (mech.shotsFired === 0) onFirstFire(world, def);
      fireMove(world, def);
      mech.shotsFired += 1;
    }
    mech.actionFired = true;
  }

  // 受付前に来ていた入力を、受付が始まった時点で出す
  const buffered = mech.buffered;
  if (buffered !== null) {
    if (world.time - buffered.at > INPUT_BUFFER_S) {
      mech.buffered = null;
    } else if (cancelState(mech, buffered.action, buffered.move) === 'open') {
      startAction(world, buffered.action, buffered.move, true);
      return;
    }
  }

  if (mech.actionTime >= def.duration) {
    if (mech.action === 'guard' && keepGuarding(world, dt)) return;
    finishAction(world);
  }
}

/**
 * 盾を構えた時間が過ぎたあとも構え続けるか。成立している間は続き、前を長く倒していればブーストを使って延びる
 */
function keepGuarding(world: SimWorld, dt: number): boolean {
  const { mech } = world;
  if (mech.guardBlockUntil !== null && world.time < mech.guardBlockUntil) return true;
  if (!mech.leverHeld.includes('forward') || mech.actionTime >= GUARD_HOLD_MAX_S || mech.overheat) return false;
  mech.boost -= GUARD_HOLD_BOOST_PER_SEC * boostScaleOf(world) * dt;
  if (mech.boost <= 0) {
    mech.boost = 0;
    mech.overheat = true;
    return false;
  }
  return true;
}

/** 硬直中に入れておいた盾を、硬直が切れたら出す */
function stepGuardQueue(world: SimWorld): void {
  const { mech } = world;
  const at = mech.guardQueuedAt;
  if (at === null) return;
  if (world.time - at > GUARD_QUEUE_S) {
    mech.guardQueuedAt = null;
    return;
  }
  if (mech.action !== 'idle' || mech.landingLag > 0) return;
  mech.guardQueuedAt = null;
  const resolved = resolveMove(world, 'guard');
  if (!isRejection(resolved) && startAction(world, 'guard', resolved, false)) pushEvent(world, 'route', '先行入力盾');
}

/** 正面から来た敵の弾を盾で防いだか。防いだら構えを延ばし、ブーストが少なければ少し戻す */
function guardBlocks(world: SimWorld, p: Projectile): boolean {
  const { mech } = world;
  if (mech.action !== 'guard') return false;
  // 盾は正面だけ。弾が機体の向きから 90 度より後ろにあれば防げない
  const toShot = Math.atan2(p.pos.x - mech.pos.x, p.pos.z - mech.pos.z);
  if (Math.abs(angleDiff(mech.yaw, toShot)) > Math.PI / 2) return false;
  const first = mech.guardBlockUntil === null;
  mech.guardBlockUntil = world.time + GUARD_BLOCK_HOLD_S;
  if (mech.boost < GUARD_RECOVER_BELOW) {
    mech.boost = Math.min(BOOST_MAX, mech.boost + GUARD_RECOVER_AMOUNT);
    mech.overheat = false;
  }
  spawnEffect(world, 'guard', {
    x: mech.pos.x + Math.sin(mech.yaw) * 1.2,
    y: mech.pos.y + 1.5,
    z: mech.pos.z + Math.cos(mech.yaw) * 1.2,
  });
  if (first) pushEvent(world, 'route', '盾成立');
  return true;
}

/** 弾以外の、技が出た瞬間の効果（斬撃・アシスト・時限強化） */
function onFirstFire(world: SimWorld, def: ActionDef): void {
  const { mech } = world;
  if (def.strike) {
    spawnEffect(world, 'slash', {
      x: mech.pos.x + Math.sin(mech.lockYaw) * 1.5,
      y: mech.pos.y + 1.8,
      z: mech.pos.z + Math.cos(mech.lockYaw) * 1.5,
    });
    if (towardEnemy(world).distance <= (def.reach ?? MELEE_HIT_RANGE)) hitEnemy(world);
  }
  if (def.dismissAssist) world.assists = world.assists.filter((a) => a.kind !== def.dismissAssist);
  if (def.assist) spawnAssist(world, def.assist);
  if (def.buff === 'seed') {
    const unit = unitOf(world);
    mech.seedTime = unit.seedDuration ?? 20;
    for (const [key, ammoDef] of Object.entries(unit.ammo)) {
      if (ammoDef.refillOnSeed && mech.ammo[key]) mech.ammo[key] = { count: ammoDef.max, timer: 0 };
    }
    pushEvent(world, 'route', 'SEED発現');
  }
}

function stepAmmo(world: SimWorld, dt: number): void {
  const { mech } = world;
  const unit = unitOf(world);
  for (const [key, def] of Object.entries(unit.ammo)) {
    const ammo = mech.ammo[key];
    if (!ammo) continue;
    if (def.waitsForPack && mech.packOut) continue;
    const waitsFor = def.waitsForAssists;
    if (waitsFor && world.assists.some((a) => waitsFor.includes(a.kind))) continue;
    const reload = seedActive(mech) ? (def.seedReload ?? def.reload) : def.reload;
    if (def.mode === 'each' ? ammo.count < def.max : ammo.count <= 0) {
      ammo.timer += dt;
      if (ammo.timer >= reload) {
        ammo.timer = 0;
        ammo.count = def.mode === 'each' ? ammo.count + 1 : def.max;
      }
    } else {
      ammo.timer = 0;
    }
  }
  if (mech.seedTime > 0) {
    mech.seedTime = Math.max(0, mech.seedTime - dt);
    if (mech.seedTime === 0) mech.seedCooldown = unit.seedCooldown ?? 0;
  } else if (mech.seedCooldown > 0) {
    mech.seedCooldown = Math.max(0, mech.seedCooldown - dt);
  }
}

/** 着地した瞬間の硬直。ブーストを吹かした回数が多いほど長い */
function landingLagFor(mech: MechState): number {
  const extra = Math.max(0, mech.airBoostUses - AIR_BOOST_FREE_USES) * LANDING_LAG_PER_USE_S;
  return Math.min(LANDING_LAG_MAX_S, LANDING_LAG_S + extra);
}

function stepFacing(world: SimWorld, dt: number): void {
  const { mech } = world;
  const { dx, dz } = towardEnemy(world);
  mech.lockYaw = Math.atan2(dx, dz);

  let target: number | null = null;
  switch (mech.action) {
    case 'bd':
      // BD 中は進む向きを向く
      if (mech.bdDir) mech.yaw = yawOf(mech.bdDir);
      return;
    case 'jump': {
      // 上昇中にレバーを回すと向きを変えられる（方向転換上昇）
      const lever = leverToWorld(world, mech.leverHeld);
      if (lever) target = yawOf(lever);
      break;
    }
    case 'step':
      // ステップは姿勢を保ったまま動く
      break;
    case 'shot':
      // 移動撃ちは体の向きを変えない。振り向き撃ちは敵へ向き直る
      if (mech.turnShot) target = mech.lockYaw;
      break;
    case 'idle':
      if (mech.grounded) target = mech.lockYaw;
      break;
    default:
      // 格闘・サブ・特射・CS は敵の方を向いて出す
      target = mech.lockYaw;
      break;
  }
  if (target !== null) mech.yaw = turnToward(mech.yaw, target, FACE_TURN_RATE * dt);
}

function stepMechPhysics(world: SimWorld, dt: number): void {
  const { mech } = world;
  const move = moveModeOf(mech);

  if (move === 'free' || move === 'halt') {
    const shotAfterBd = mech.action === 'shot' && mech.chain[mech.chain.length - 2] === 'bd';
    const gravityScale = mech.grounded
      ? 1
      : move === 'halt'
        ? 0.3
        : shotAfterBd
          ? SHOT_AFTER_BD_GRAVITY_SCALE
          : 1;
    mech.vel.y -= GRAVITY * gravityScale * dt;
    // 滑り特射は足が止まる行動でも滑りを残す。慣性ジャンプは着地まで勢いが落ちにくい
    const damping = mech.sliding
      ? 1.2
      : mech.grounded || move === 'halt'
        ? 10
        : mech.inertiaFlight
          ? INERTIA_AIR_DAMPING
          : 1.5;
    const keep = Math.exp(-damping * dt);
    mech.vel.x *= keep;
    mech.vel.z *= keep;

    // 何もしていないときはレバーで動く。地上は歩き、空中は少しだけ流れる
    const lever = mech.action === 'idle' ? leverToWorld(world, mech.leverHeld) : null;
    if (lever && mech.grounded && mech.landingLag === 0) {
      mech.vel.x = lever.x * WALK_SPEED * speedScaleOf(world);
      mech.vel.z = lever.z * WALK_SPEED * speedScaleOf(world);
    } else if (lever && !mech.grounded && !mech.inertiaFlight) {
      mech.vel.x += (lever.x * AIR_DRIFT_SPEED - mech.vel.x) * Math.min(1, 2 * dt);
      mech.vel.z += (lever.z * AIR_DRIFT_SPEED - mech.vel.z) * Math.min(1, 2 * dt);
    }
  }

  mech.pos.x += mech.vel.x * dt;
  mech.pos.y += mech.vel.y * dt;
  mech.pos.z += mech.vel.z * dt;

  if (mech.pos.y <= 0) {
    mech.pos.y = 0;
    // BD・ステップ・踏み込みは高度を保つ動きなので、地上で出しても着地にはしない
    const keepsAltitude = move === 'dash' || move === 'step' || move === 'lunge' || move === 'roll';
    if (keepsAltitude) {
      mech.grounded = true;
    } else if (!mech.grounded && mech.vel.y <= 0 && mech.action === 'guard') {
      // 空中で構えた盾は、着地しても構えたまま。構え終わってから着地の硬直が入る
      mech.grounded = true;
      mech.vel.x = 0;
      mech.vel.z = 0;
      spawnEffect(world, 'land', mech.pos);
    } else if (!mech.grounded && mech.vel.y <= 0) {
      mech.grounded = true;
      mech.landingLag = landingLagFor(mech);
      endAction(mech);
      mech.chainGraceUntil = null;
      mech.inertiaAvailable = false;
      mech.inertiaFlight = false;
      mech.airBoostUses = 0;
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
    mech.landingLag = landingLagFor(mech);
    mech.inertiaAvailable = false;
    mech.inertiaFlight = false;
    mech.airBoostUses = 0;
  }

  if (mech.landingLag > 0) {
    mech.landingLag -= dt;
    if (mech.landingLag <= 0) {
      mech.landingLag = 0;
      mech.boost = BOOST_MAX;
      mech.overheat = false;
    }
  }

  stepFacing(world, dt);
}

function stepEnemy(world: SimWorld, dt: number): void {
  const { enemy } = world;
  // 止めているあいだはその場に留まり、動かし直すとそこから左右に揺れ始める
  if (enemy.moves) {
    enemy.swayTime += dt;
    enemy.pos.x = ENEMY_BASE.x + Math.sin(enemy.swayTime * ENEMY_SWAY_SPEED) * ENEMY_SWAY;
  }
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  world.mech.hitFlash = Math.max(0, world.mech.hitFlash - dt);
  if (enemy.fireInterval <= 0) return;
  enemy.fireTimer -= dt;
  if (enemy.fireTimer <= 0) {
    enemy.fireTimer = enemy.fireInterval;
    spawnEnemyBeam(world);
  }
}

function stepProjectiles(world: SimWorld, dt: number): void {
  const enemyAt = enemyCenter(world);
  const mechCenter: Vec3 = { x: world.mech.pos.x, y: world.mech.pos.y + 1.5, z: world.mech.pos.z };
  world.projectiles = world.projectiles.filter((p) => {
    const target = p.owner === 'mech' ? enemyAt : mechCenter;
    if (p.homing > 0) {
      const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      const tx = target.x - p.pos.x;
      const ty = target.y - p.pos.y;
      const tz = target.z - p.pos.z;
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

    const radius = p.owner === 'mech' ? ENEMY_HIT_RADIUS : MECH_HIT_RADIUS;
    const distance = Math.hypot(p.pos.x - target.x, p.pos.y - target.y, p.pos.z - target.z);
    if (distance <= radius + p.radius) {
      if (p.owner === 'mech') hitEnemy(world);
      else if (!guardBlocks(world, p)) hitMech(world);
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
  stepEnemy(world, dt);
  stepAmmo(world, dt);
  stepJumpPress(world);
  stepAction(world, dt);
  stepMechPhysics(world, dt);
  stepGuardQueue(world);
  stepAssists(world, dt);
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
