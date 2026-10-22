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
    expect(applyInput(world, 'jump')).toBe('started');
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
    expect(applyInput(world, 'shot')).toBe('rejected');
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
    expect(applyInput(world, 'bd')).toBe('rejected');
    // ブーストを使わない射撃は出せる
    expect(applyInput(world, 'shot')).toBe('started');
  });

  it('地上でブーストを使い切っても、止まれば硬直のあとに回復する', () => {
    const world = createWorld();
    // BD が切れる前に次の BD を重ねて、止まらずに使い切る
    applyInput(world, 'bd');
    for (let i = 0; i < 2000 && !world.mech.overheat; i++) {
      if (world.mech.actionTime > 0.4) applyInput(world, 'bd');
      stepWorld(world, FIXED_DT);
    }
    expect(world.mech.grounded).toBe(true);
    expect(world.mech.overheat).toBe(true);
    run(world, LANDING_LAG_S + 0.1);
    expect(world.mech.overheat).toBe(false);
    expect(world.mech.boost).toBe(BOOST_MAX);
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
      run(world, 0.45);
    }
    // BD 中に格闘で上書きする
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

  describe('キャンセルルート', () => {
    function fireShot(world: SimWorld) {
      applyInput(world, 'shot');
      run(world, ACTIONS.shot.fireAt! + FIXED_DT);
    }

    function lastEvent(world: SimWorld) {
      return world.events[world.events.length - 1];
    }

    it('射撃の硬直は BD でキャンセルでき、BD から射撃を出すとズンダになる', () => {
      const world = createWorld();
      fireShot(world);
      expect(applyInput(world, 'bd')).toBe('canceled');
      expect(lastEvent(world).label).toBe('BDC');
      run(world, 0.1);
      expect(applyInput(world, 'shot')).toBe('canceled');
      expect(lastEvent(world)).toMatchObject({ kind: 'route', label: 'ズンダ' });

      run(world, ACTIONS.shot.fireAt! + FIXED_DT);
      applyInput(world, 'bd');
      run(world, 0.1);
      applyInput(world, 'shot');
      expect(lastEvent(world).label).toBe('ズンダ 3発');
    });

    it('射撃から射撃・格闘・ジャンプへは直接キャンセルできない', () => {
      for (const next of ['shot', 'melee', 'jump'] as const) {
        const world = createWorld();
        fireShot(world);
        expect(applyInput(world, next)).toBe('rejected');
        expect(lastEvent(world)).toMatchObject({ kind: 'reject', label: 'キャンセル不可' });
        expect(world.mech.action).toBe('shot');
      }
    });

    it.each([
      ['sub', 'サブC'],
      ['special-shot', '特射C'],
      ['special-melee', '特格C'],
    ] as const)('射撃から %s へキャンセルできる', (next, label) => {
      const world = createWorld();
      fireShot(world);
      expect(applyInput(world, next)).toBe('canceled');
      expect(world.mech.action).toBe(next);
      expect(lastEvent(world).label).toBe(label);
    });

    it('弾が出る前のキャンセル入力は受付まで待って出す', () => {
      const world = createWorld();
      applyInput(world, 'shot');
      run(world, 0.05);
      expect(applyInput(world, 'bd')).toBe('buffered');
      expect(world.mech.action).toBe('shot');
      run(world, ACTIONS.shot.fireAt!);
      expect(world.mech.action).toBe('bd');
      expect(world.projectiles).toHaveLength(1);
    });

    it('受付まで間が空きすぎた入力は捨てる', () => {
      const world = createWorld();
      applyInput(world, 'special-shot');
      expect(applyInput(world, 'bd')).toBe('buffered');
      run(world, ACTIONS['special-shot'].fireAt! + FIXED_DT);
      expect(world.mech.action).toBe('special-shot');
      expect(world.mech.buffered).toBeNull();
    });

    it('格闘は追加入力で 3 段目まで出せて、4 段目は出ない', () => {
      const world = createWorld();
      // BD 中に格闘を出して間合いを詰める
      applyInput(world, 'bd');
      run(world, 0.45);
      applyInput(world, 'bd');
      run(world, 0.45);
      applyInput(world, 'melee');
      while (!world.mech.actionFired) stepWorld(world, FIXED_DT);
      expect(world.mech.meleeStage).toBe(1);

      for (const stage of [2, 3]) {
        expect(applyInput(world, 'melee')).toBe('canceled');
        expect(world.mech.meleeStage).toBe(stage);
        expect(lastEvent(world).label).toBe(`格闘 ${stage}段目`);
        while (!world.mech.actionFired) stepWorld(world, FIXED_DT);
      }
      expect(applyInput(world, 'melee')).toBe('rejected');
      expect(world.enemy.hitCount).toBe(3);
    });

    it('BD 中は何でも出せる', () => {
      for (const next of ['shot', 'melee', 'jump', 'sub', 'special-shot', 'special-melee'] as const) {
        const world = createWorld();
        applyInput(world, 'bd');
        run(world, 0.1);
        expect(applyInput(world, next)).toBe('canceled');
      }
    });

    it('オーバーヒート中は BD キャンセルできない', () => {
      const world = createWorld();
      applyInput(world, 'jump');
      run(world, 0.1);
      world.mech.boost = 0;
      world.mech.overheat = true;
      fireShot(world);
      expect(applyInput(world, 'bd')).toBe('rejected');
      expect(lastEvent(world).label).toBe('OVERHEAT');
    });

    it('行動が終わって止まると、つないだ並びはリセットされる', () => {
      const world = createWorld();
      fireShot(world);
      run(world, ACTIONS.shot.duration);
      expect(world.mech.action).toBe('idle');
      applyInput(world, 'bd');
      run(world, 0.1);
      applyInput(world, 'shot');
      expect(world.mech.chain).toEqual(['bd', 'shot']);
    });
  });

  it('射撃・着地・命中で見た目の効果が出て、寿命で消える', () => {
    const world = createWorld();
    applyInput(world, 'shot');
    run(world, ACTIONS.shot.fireAt! + FIXED_DT);
    expect(world.effects.map((e) => e.kind)).toContain('muzzle');
    run(world, 0.5);
    expect(world.effects.map((e) => e.kind)).toContain('hit');
    run(world, 1);
    expect(world.effects).toHaveLength(0);
  });

  it('advanceWorld は固定刻みで進め、余りを返す', () => {
    const world = createWorld();
    const carry = advanceWorld(world, FIXED_DT * 2.5, 0);
    expect(world.time).toBeCloseTo(FIXED_DT * 2, 10);
    expect(carry).toBeCloseTo(FIXED_DT * 0.5, 10);
  });
});
