import { describe, it, expect } from 'vitest';
import {
  BOOST_MAX,
  GUARD_HOLD_MAX_S,
  GUARD_INPUT_WINDOW_S,
  GUARD_RECOVER_AMOUNT,
  GUARD_TIME_S,
  JUMP_HOLD_S,
} from '@/features/input-relay/sim/actions';
import { applyInput, applyRawInput, createWorld, FIXED_DT, setLever, stepWorld } from '@/features/input-relay/sim/step';
import type { Projectile, SimWorld } from '@/features/input-relay/sim/types';
import { GENERIC_UNIT, UNITS } from '@/features/input-relay/sim/units';

function run(world: SimWorld, seconds: number) {
  for (let t = 0; t < seconds; t += FIXED_DT) stepWorld(world, FIXED_DT);
}

/** レバーを倒してすぐ戻す */
function flick(world: SimWorld, direction: 'forward' | 'back') {
  const result = setLever(world, direction, true);
  run(world, 0.03);
  setLever(world, direction, false);
  return result;
}

/** 後→前（盾の入力）。前は倒したままにする */
function inputGuard(world: SimWorld) {
  flick(world, 'back');
  run(world, 0.05);
  return setLever(world, 'forward', true);
}

function labels(world: SimWorld) {
  return world.events.map((e) => e.label);
}

/** 機体の正面（敵の方向。機体は原点、敵は z=-40）から飛んでくる敵の弾 */
function enemyShot(world: SimWorld, from: 'front' | 'back'): Projectile {
  const z = from === 'front' ? -4 : 4;
  const p: Projectile = {
    id: world.nextProjectileId++,
    kind: 'enemy-beam',
    owner: 'enemy',
    pos: { x: world.mech.pos.x, y: world.mech.pos.y + 1.5, z: world.mech.pos.z + z },
    vel: { x: 0, y: 0, z: from === 'front' ? 70 : -70 },
    life: 1,
    radius: 0.25,
    homing: 0,
  };
  world.projectiles.push(p);
  return p;
}

describe('盾（レバー後→前）', () => {
  it('後ろに倒してすぐ前に倒すと盾を構える', () => {
    const world = createWorld({ enemyMoves: false });
    expect(inputGuard(world)).toBe('started');
    expect(world.mech.action).toBe('guard');
    expect(labels(world)).toContain('盾');
  });

  it('後ろから前までが遅いと盾にならない', () => {
    const world = createWorld({ enemyMoves: false });
    flick(world, 'back');
    run(world, GUARD_INPUT_WINDOW_S + 0.05);
    expect(setLever(world, 'forward', true)).toBeNull();
    expect(world.mech.action).toBe('idle');
  });

  it('前→後は盾ではない', () => {
    const world = createWorld({ enemyMoves: false });
    flick(world, 'forward');
    run(world, 0.05);
    setLever(world, 'back', true);
    expect(world.mech.action).toBe('idle');
  });

  it('同じ方向の 2 回入れはこれまでどおりステップ', () => {
    for (const direction of ['back', 'forward'] as const) {
      const world = createWorld({ enemyMoves: false });
      flick(world, direction);
      run(world, 0.05);
      expect(setLever(world, direction, true)).toBe('started');
      expect(world.mech.action).toBe('step');
    }
  });

  it('後→前→前は前ステップに化けず盾のまま（後入力からの前ステは盾になる）', () => {
    const world = createWorld({ enemyMoves: false });
    inputGuard(world);
    run(world, 0.03);
    setLever(world, 'forward', false);
    run(world, 0.03);
    setLever(world, 'forward', true);
    expect(world.mech.action).toBe('guard');
  });

  it('前を戻すと構えの時間で終わる', () => {
    const world = createWorld({ enemyMoves: false });
    inputGuard(world);
    setLever(world, 'forward', false);
    run(world, GUARD_TIME_S - 0.05);
    expect(world.mech.action).toBe('guard');
    run(world, 0.1);
    expect(world.mech.action).not.toBe('guard');
  });

  it('前を長く倒し続けるとブーストを使って延び、上限で終わる', () => {
    const world = createWorld({ enemyMoves: false });
    inputGuard(world);
    run(world, GUARD_TIME_S + 0.3);
    expect(world.mech.action).toBe('guard');
    expect(world.mech.boost).toBeLessThan(BOOST_MAX);
    run(world, GUARD_HOLD_MAX_S);
    expect(world.mech.action).not.toBe('guard');
  });

  it('盾は足を止めて敵の方を向く', () => {
    const world = createWorld({ enemyMoves: false });
    world.mech.yaw = 0;
    world.mech.vel.x = 10;
    inputGuard(world);
    run(world, 0.3);
    expect(Math.abs(world.mech.vel.x)).toBeLessThan(1);
    expect(world.mech.yaw).toBeCloseTo(world.mech.lockYaw, 1);
  });

  it('空中でも出せて、着地しても構えたまま', () => {
    const world = createWorld({ enemyMoves: false });
    applyRawInput(world, { button: 'jump', phase: 'down' });
    run(world, JUMP_HOLD_S + 0.1);
    applyRawInput(world, { button: 'jump', phase: 'up' });
    run(world, 0.05);
    expect(world.mech.grounded).toBe(false);
    expect(inputGuard(world)).toBe('started');
    // 前を倒したまま延ばして、構えたまま着地させる
    for (let t = 0; t < GUARD_HOLD_MAX_S && !world.mech.grounded; t += FIXED_DT) stepWorld(world, FIXED_DT);
    expect(world.mech.grounded).toBe(true);
    expect(world.mech.action).toBe('guard');
    expect(world.mech.landingLag).toBe(0);
  });

  it('BD 中ならすぐ盾に移れる', () => {
    const world = createWorld({ enemyMoves: false });
    applyRawInput(world, { button: 'jump', phase: 'down' });
    applyInput(world, 'bd');
    run(world, 0.1);
    expect(inputGuard(world)).toBe('canceled');
    expect(world.mech.action).toBe('guard');
  });

  it('盾から BD・格闘（盾前格）に移れる', () => {
    const toBd = createWorld({ enemyMoves: false });
    inputGuard(toBd);
    applyRawInput(toBd, { button: 'jump', phase: 'down' });
    expect(applyInput(toBd, 'bd')).toBe('canceled');

    const toMelee = createWorld({ enemyMoves: false });
    inputGuard(toMelee);
    expect(applyInput(toMelee, 'melee')).toBe('canceled');
    expect(toMelee.mech.action).toBe('melee');
  });

  it('盾から射撃にはキャンセルできない', () => {
    const world = createWorld({ enemyMoves: false });
    inputGuard(world);
    expect(applyInput(world, 'shot')).toBe('rejected');
    expect(world.mech.action).toBe('guard');
  });

  describe('先行入力', () => {
    it('着地硬直中に入れた盾は、硬直が切れた瞬間に出る', () => {
      const world = createWorld({ enemyMoves: false });
      world.mech.landingLag = 0.2;
      world.mech.boost = 50;
      expect(inputGuard(world)).toBe('buffered');
      expect(world.mech.action).toBe('idle');
      run(world, 0.2);
      expect(world.mech.action).toBe('guard');
      expect(labels(world)).toContain('先行入力盾');
    });

    it('キャンセルできない技の硬直中に入れた盾は、技が終わったら出る', () => {
      const world = createWorld({ enemyMoves: false });
      applyInput(world, 'special-shot');
      run(world, 0.4);
      expect(inputGuard(world)).toBe('buffered');
      expect(world.mech.action).toBe('special-shot');
      run(world, 0.5);
      expect(world.mech.action).toBe('guard');
    });

    it('先行入力のあとに別の行動を出したら、盾は出ない', () => {
      const queued = createWorld({ enemyMoves: false });
      applyInput(queued, 'special-shot');
      run(queued, 0.4);
      inputGuard(queued);
      applyRawInput(queued, { button: 'jump', phase: 'down' });
      expect(applyInput(queued, 'bd')).toBe('canceled');
      run(queued, 0.6);
      expect(queued.mech.action).toBe('bd');
    });
  });

  describe('成立', () => {
    it('正面の弾を防ぎ、被弾しない。成立したら構えが延びる', () => {
      const world = createWorld({ enemyMoves: false });
      inputGuard(world);
      setLever(world, 'forward', false);
      run(world, GUARD_TIME_S - 0.1);
      enemyShot(world, 'front');
      run(world, 0.1);
      expect(world.mechHits).toBe(0);
      expect(labels(world)).toContain('盾成立');
      expect(world.effects.some((e) => e.kind === 'guard')).toBe(true);
      run(world, 0.2);
      expect(world.mech.action).toBe('guard');
    });

    it('後ろからの弾は防げない', () => {
      const world = createWorld({ enemyMoves: false });
      inputGuard(world);
      run(world, 0.1);
      enemyShot(world, 'back');
      run(world, 0.1);
      expect(world.mechHits).toBe(1);
    });

    it('ブーストが少ないときに成立すると、少し回復してオーバーヒートが解ける', () => {
      const world = createWorld({ enemyMoves: false });
      applyRawInput(world, { button: 'jump', phase: 'down' });
      run(world, JUMP_HOLD_S + 0.1);
      applyRawInput(world, { button: 'jump', phase: 'up' });
      world.mech.boost = 0;
      world.mech.overheat = true;
      inputGuard(world);
      expect(world.mech.action).toBe('guard');
      enemyShot(world, 'front');
      run(world, 0.1);
      expect(world.mech.boost).toBe(GUARD_RECOVER_AMOUNT);
      expect(world.mech.overheat).toBe(false);
    });
  });

  it('盾コマンドの無い機体は出せない', () => {
    const unit = GENERIC_UNIT as { shieldGuard: boolean };
    unit.shieldGuard = false;
    try {
      const world = createWorld({ enemyMoves: false });
      expect(inputGuard(world)).toBe('rejected');
      expect(labels(world)).toContain('盾なし');
    } finally {
      unit.shieldGuard = true;
    }
  });

  it('いまの機体はどれも盾コマンドあり（wiki の基本情報）', () => {
    for (const unit of UNITS) {
      const world = createWorld({ unitId: unit.id, enemyMoves: false });
      expect(inputGuard(world)).toBe('started');
    }
  });
});
