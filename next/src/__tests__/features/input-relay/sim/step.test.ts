import { describe, it, expect } from 'vitest';
import { ACTIONS, BOOST_MAX, LANDING_LAG_S } from '@/features/input-relay/sim/actions';
import { advanceWorld, applyInput, createWorld, FIXED_DT, stepWorld } from '@/features/input-relay/sim/step';
import type { SimWorld } from '@/features/input-relay/sim/types';

function run(world: SimWorld, seconds: number) {
  for (let t = 0; t < seconds; t += FIXED_DT) stepWorld(world, FIXED_DT);
}

function distanceToEnemy(world: SimWorld) {
  return Math.hypot(world.enemy.pos.x - world.mech.pos.x, world.enemy.pos.z - world.mech.pos.z);
}

describe('sim', () => {
  it('機体は常に敵の方を向く', () => {
    const world = createWorld();
    run(world, 2);
    const expected = Math.atan2(world.enemy.pos.x - world.mech.pos.x, world.enemy.pos.z - world.mech.pos.z);
    expect(world.mech.yaw).toBeCloseTo(expected, 5);
  });

  it('ジャンプで上昇してブーストを消費し、着地硬直のあとに全回復する', () => {
    const world = createWorld();
    expect(applyInput(world, 'jump')).toBe(true);
    expect(world.mech.boost).toBe(BOOST_MAX - ACTIONS.jump.boostCost);
    run(world, 0.3);
    expect(world.mech.pos.y).toBeGreaterThan(2);
    expect(world.mech.grounded).toBe(false);

    run(world, 2);
    expect(world.mech.grounded).toBe(true);
    expect(world.mech.boost).toBe(BOOST_MAX);
  });

  it('着地硬直中は行動を受け付けない', () => {
    const world = createWorld();
    applyInput(world, 'jump');
    // 着地した瞬間まで進める
    while (!world.mech.grounded || world.mech.landingLag === 0) stepWorld(world, FIXED_DT);
    expect(world.mech.landingLag).toBeGreaterThan(0);
    expect(world.mech.landingLag).toBeLessThanOrEqual(LANDING_LAG_S);
    expect(applyInput(world, 'shot')).toBe(false);
  });

  it('BD は敵の方向へ進み、落下せず、ブーストを使い続ける', () => {
    const world = createWorld();
    applyInput(world, 'jump');
    run(world, 0.2);
    const heightBefore = world.mech.pos.y;
    const distanceBefore = distanceToEnemy(world);
    applyInput(world, 'bd');
    run(world, 0.3);
    expect(distanceToEnemy(world)).toBeLessThan(distanceBefore - 5);
    expect(world.mech.pos.y).toBeCloseTo(heightBefore, 1);
    expect(world.mech.boost).toBeLessThan(BOOST_MAX - ACTIONS.jump.boostCost - ACTIONS.bd.boostCost);
  });

  it('空中でブーストを使い切るとオーバーヒートし、着地まで BD できない', () => {
    const world = createWorld();
    applyInput(world, 'jump');
    run(world, 0.1);
    // BD を切れ目なく出し続けて、使い切った瞬間で止める
    for (let i = 0; i < 2000 && !world.mech.overheat; i++) {
      if (world.mech.action === 'idle') applyInput(world, 'bd');
      stepWorld(world, FIXED_DT);
    }
    expect(world.mech.overheat).toBe(true);
    expect(world.mech.grounded).toBe(false);
    expect(applyInput(world, 'bd')).toBe(false);
    // ブーストを使わない射撃は出せる
    expect(applyInput(world, 'shot')).toBe(true);
  });

  it('射撃でビームが出て敵に当たる', () => {
    const world = createWorld();
    applyInput(world, 'shot');
    run(world, ACTIONS.shot.fireAt! + FIXED_DT);
    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0].kind).toBe('beam');
    run(world, 1);
    expect(world.enemy.hitCount).toBe(1);
    expect(world.projectiles).toHaveLength(0);
  });

  it('サブはミサイルを 3 発出す', () => {
    const world = createWorld();
    applyInput(world, 'sub');
    run(world, ACTIONS.sub.fireAt! + FIXED_DT);
    expect(world.projectiles.filter((p) => p.kind === 'missile')).toHaveLength(3);
  });

  it('格闘は敵に詰め寄って当てる', () => {
    const world = createWorld();
    // 遠いと届かないので BD で詰めてから
    for (let i = 0; i < 2; i++) {
      applyInput(world, 'bd');
      run(world, 0.5);
    }
    applyInput(world, 'melee');
    run(world, ACTIONS.melee.duration);
    expect(world.enemy.hitCount).toBe(1);
  });

  it('射チャージは開始で溜め状態になり、終わりで射CSを撃つ', () => {
    const world = createWorld();
    applyInput(world, 'shot-charge-start');
    expect(world.mech.charging.shot).toBe(true);
    expect(world.mech.action).toBe('idle');
    applyInput(world, 'shot-charge-end');
    expect(world.mech.charging.shot).toBe(false);
    expect(world.mech.action).toBe('shot-cs');
    run(world, ACTIONS['shot-cs'].fireAt! + FIXED_DT);
    expect(world.projectiles[0].kind).toBe('cs-beam');
  });

  it('行動中の新しい入力は今の行動を上書きする', () => {
    const world = createWorld();
    applyInput(world, 'shot');
    run(world, 0.05);
    applyInput(world, 'sub');
    expect(world.mech.action).toBe('sub');
    expect(world.mech.actionTime).toBe(0);
  });

  it('advanceWorld は固定刻みで進め、余りを返す', () => {
    const world = createWorld();
    const carry = advanceWorld(world, FIXED_DT * 2.5, 0);
    expect(world.time).toBeCloseTo(FIXED_DT * 2, 10);
    expect(carry).toBeCloseTo(FIXED_DT * 0.5, 10);
  });
});
