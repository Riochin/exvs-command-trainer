import { describe, it, expect } from 'vitest';
import {
  ACTIONS,
  BOOST_MAX,
  INERTIA_LEVER_WINDOW_S,
  LANDING_LAG_S,
  STEP_TAP_WINDOW_S,
  WALK_SPEED,
} from '@/features/input-relay/sim/actions';
import {
  advanceWorld,
  applyInput,
  applyRawInput,
  createWorld,
  ENEMY_FIRE_INTERVAL_S,
  FIXED_DT,
  setLever,
  stepWorld,
} from '@/features/input-relay/sim/step';
import type { LeverDirection, SimWorld } from '@/features/input-relay/sim/types';

function run(world: SimWorld, seconds: number) {
  for (let t = 0; t < seconds; t += FIXED_DT) stepWorld(world, FIXED_DT);
}

function distanceToEnemy(world: SimWorld) {
  return Math.hypot(world.enemy.pos.x - world.mech.pos.x, world.enemy.pos.z - world.mech.pos.z);
}

function jumpDown(world: SimWorld) {
  return applyRawInput(world, { button: 'jump', phase: 'down' });
}

function jumpUp(world: SimWorld) {
  applyRawInput(world, { button: 'jump', phase: 'up' });
}

/** ジャンプを押してから離すまで seconds 秒 */
function holdJump(world: SimWorld, seconds: number) {
  jumpDown(world);
  run(world, seconds);
  jumpUp(world);
}

/** アケコンと同じく、2 回目のジャンプ押下で BD が届く。ボタンは押したまま */
function startBd(world: SimWorld) {
  jumpDown(world);
  return applyInput(world, 'bd');
}

function fireShot(world: SimWorld) {
  applyInput(world, 'shot');
  run(world, ACTIONS.shot.fireAt! + FIXED_DT);
}

function lastEvent(world: SimWorld) {
  return world.events[world.events.length - 1];
}

function tapLever(world: SimWorld, direction: LeverDirection) {
  const result = setLever(world, direction, true);
  setLever(world, direction, false);
  return result;
}

describe('sim', () => {
  it('機体は常に敵の方を向く', () => {
    const world = createWorld();
    run(world, 2);
    const expected = Math.atan2(world.enemy.pos.x - world.mech.pos.x, world.enemy.pos.z - world.mech.pos.z);
    expect(world.mech.yaw).toBeCloseTo(expected, 5);
  });

  describe('ジャンプ', () => {
    it('押した瞬間に上昇を始め、離すと落ちて着地し、硬直のあとにブーストが全回復する', () => {
      const world = createWorld();
      expect(jumpDown(world)).toBe('started');
      run(world, 0.3);
      expect(world.mech.pos.y).toBeGreaterThan(3);
      jumpUp(world);
      run(world, 3);
      expect(world.mech.grounded).toBe(true);
      expect(world.mech.boost).toBe(BOOST_MAX);
    });

    it('長く押すほど高く上がり、ブーストを多く使う', () => {
      const short = createWorld();
      holdJump(short, 0.2);
      const long = createWorld();
      holdJump(long, 0.8);
      expect(long.mech.pos.y).toBeGreaterThan(short.mech.pos.y * 2);
      expect(long.mech.boost).toBeLessThan(short.mech.boost - 15);
    });

    it('押しっぱなしでもブーストが尽きたら上昇が止まる', () => {
      const world = createWorld();
      jumpDown(world);
      run(world, 5);
      expect(world.mech.overheat).toBe(true);
      expect(world.mech.action).toBe('idle');
    });

    it('解釈済みの jump は使わない（生入力で扱う）', () => {
      const world = createWorld();
      expect(applyInput(world, 'jump')).toBe('rejected');
      expect(world.events).toHaveLength(0);
    });

    it('着地硬直中は行動を受け付けない', () => {
      const world = createWorld();
      holdJump(world, 0.1);
      while (!world.mech.grounded || world.mech.landingLag === 0) stepWorld(world, FIXED_DT);
      expect(world.mech.landingLag).toBeLessThanOrEqual(LANDING_LAG_S);
      expect(applyInput(world, 'shot')).toBe('rejected');
    });
  });

  describe('BD', () => {
    it('敵の方向へ進み、落下せず、ブーストを使い続ける', () => {
      const world = createWorld();
      holdJump(world, 0.2);
      const heightBefore = world.mech.pos.y;
      const distanceBefore = distanceToEnemy(world);
      startBd(world);
      run(world, 0.3);
      expect(distanceToEnemy(world)).toBeLessThan(distanceBefore - 5);
      expect(world.mech.pos.y).toBeCloseTo(heightBefore, 1);
    });

    it('ジャンプを押している間だけ続き、離すと最低限の長さで終わる', () => {
      const held = createWorld();
      startBd(held);
      run(held, 1);
      expect(held.mech.action).toBe('bd');

      const tapped = createWorld();
      startBd(tapped);
      jumpUp(tapped);
      run(tapped, ACTIONS.bd.holdMinTime! + 0.05);
      expect(tapped.mech.action).toBe('idle');
    });

    it('レバーを倒している方向へ進む', () => {
      const world = createWorld();
      setLever(world, 'right', true);
      startBd(world);
      run(world, 0.2);
      // 敵は奥（-z）。敵の方を向いたときの右は +x
      expect(world.mech.pos.x).toBeGreaterThan(3);
      expect(Math.abs(world.mech.pos.z)).toBeLessThan(1);
    });

    it('空中でブーストを使い切るとオーバーヒートし、着地まで BD できない', () => {
      const world = createWorld();
      holdJump(world, 0.1);
      startBd(world);
      for (let i = 0; i < 2000 && !world.mech.overheat; i++) stepWorld(world, FIXED_DT);
      jumpUp(world);
      expect(world.mech.overheat).toBe(true);
      expect(world.mech.grounded).toBe(false);
      expect(startBd(world)).toBe('rejected');
      // ブーストを使わない射撃は出せる
      expect(applyInput(world, 'shot')).toBe('started');
    });

    it('地上でブーストを使い切っても、止まれば硬直のあとに回復する', () => {
      const world = createWorld();
      startBd(world);
      for (let i = 0; i < 2000 && !world.mech.overheat; i++) stepWorld(world, FIXED_DT);
      jumpUp(world);
      expect(world.mech.grounded).toBe(true);
      run(world, LANDING_LAG_S + 0.1);
      expect(world.mech.overheat).toBe(false);
      expect(world.mech.boost).toBe(BOOST_MAX);
    });
  });

  describe('レバー', () => {
    it('地上で倒すと歩く。前は敵の方向', () => {
      const world = createWorld();
      setLever(world, 'forward', true);
      run(world, 0.5);
      expect(world.mech.pos.z).toBeLessThan(-WALK_SPEED * 0.4);
      setLever(world, 'forward', false);
      const stopped = world.mech.pos.z;
      run(world, 0.5);
      expect(Math.abs(world.mech.pos.z - stopped)).toBeLessThan(1);
    });

    it('同じ方向に素早く 2 回倒すとステップする', () => {
      const world = createWorld();
      expect(tapLever(world, 'left')).toBeNull();
      run(world, 0.1);
      expect(tapLever(world, 'left')).toBe('started');
      expect(world.mech.action).toBe('step');
      run(world, ACTIONS.step.duration);
      // 敵の方を向いたときの左は -x
      expect(world.mech.pos.x).toBeLessThan(-4);
      expect(world.mech.boost).toBeLessThan(BOOST_MAX);
    });

    it('間が空いたり方向が違ったりするとステップしない', () => {
      const slow = createWorld();
      tapLever(slow, 'left');
      run(slow, STEP_TAP_WINDOW_S + 0.05);
      expect(tapLever(slow, 'left')).toBeNull();

      const mixed = createWorld();
      tapLever(mixed, 'left');
      expect(tapLever(mixed, 'right')).toBeNull();
      expect(mixed.mech.action).toBe('idle');
    });
  });

  describe('弾と格闘', () => {
    it('射撃でビームが出て敵に当たる', () => {
      const world = createWorld();
      fireShot(world);
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
  });

  describe('キャンセルルート', () => {
    it('射撃の硬直は BD でキャンセルでき、BD から射撃を出すとズンダになる', () => {
      const world = createWorld();
      fireShot(world);
      expect(startBd(world)).toBe('canceled');
      expect(lastEvent(world).label).toBe('BDC');
      run(world, 0.1);
      expect(applyInput(world, 'shot')).toBe('canceled');
      expect(lastEvent(world)).toMatchObject({ kind: 'route', label: 'ズンダ' });

      run(world, ACTIONS.shot.fireAt! + FIXED_DT);
      startBd(world);
      run(world, 0.1);
      applyInput(world, 'shot');
      expect(lastEvent(world).label).toBe('ズンダ 3発');
    });

    it('射撃の硬直はステップでもキャンセルでき、つなぐとステズンダになる', () => {
      const world = createWorld();
      fireShot(world);
      tapLever(world, 'right');
      expect(tapLever(world, 'right')).toBe('canceled');
      expect(lastEvent(world).label).toBe('ステキャン');
      run(world, 0.1);
      applyInput(world, 'shot');
      expect(lastEvent(world).label).toBe('ステズンダ');
    });

    it('BD の 1 回目のジャンプ押下は、射撃中に出せなくても理由を出さない', () => {
      const world = createWorld();
      fireShot(world);
      expect(jumpDown(world)).toBe('rejected');
      expect(world.events).toHaveLength(0);
      expect(world.mech.action).toBe('shot');
    });

    it('射撃から射撃・格闘へは直接キャンセルできない', () => {
      for (const next of ['shot', 'melee'] as const) {
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
      jumpDown(world);
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

    it('格闘は追加入力で 3 段目まで出せて、4 段目は出ない。格闘はステップでキャンセルできる', () => {
      const world = createWorld();
      startBd(world);
      run(world, 0.9);
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

      tapLever(world, 'back');
      expect(tapLever(world, 'back')).toBe('canceled');
      expect(world.mech.action).toBe('step');
    });

    it('BD・ステップ中は何でも出せる', () => {
      for (const next of ['shot', 'melee', 'sub', 'special-shot', 'special-melee'] as const) {
        const viaBd = createWorld();
        startBd(viaBd);
        run(viaBd, 0.1);
        expect(applyInput(viaBd, next)).toBe('canceled');

        const viaStep = createWorld();
        tapLever(viaStep, 'left');
        tapLever(viaStep, 'left');
        run(viaStep, 0.1);
        expect(applyInput(viaStep, next)).toBe('canceled');
      }
    });

    it('オーバーヒート中は BD キャンセルできない', () => {
      const world = createWorld();
      holdJump(world, 0.1);
      world.mech.boost = 0;
      world.mech.overheat = true;
      fireShot(world);
      expect(startBd(world)).toBe('rejected');
      expect(lastEvent(world).label).toBe('OVERHEAT');
    });

    it('行動が終わって止まると、つないだ並びはリセットされる', () => {
      const world = createWorld();
      fireShot(world);
      run(world, ACTIONS.shot.duration);
      expect(world.mech.action).toBe('idle');
      startBd(world);
      run(world, 0.1);
      applyInput(world, 'shot');
      expect(world.mech.chain).toEqual(['bd', 'shot']);
      // ジャンプからの BD は BD の出だしなので、BDC とは表示しない
      expect(world.events.some((e) => e.label === 'BDC')).toBe(false);
    });
  });

  it('射撃・着地・命中で見た目の効果が出て、寿命で消える', () => {
    const world = createWorld();
    fireShot(world);
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

describe('EXVS のテクニック', () => {
  function lastRoute(world: SimWorld) {
    return [...world.events].reverse().find((e) => e.kind === 'route')?.label;
  }

  function speedXZ(world: SimWorld) {
    return Math.hypot(world.mech.vel.x, world.mech.vel.z);
  }

  /** BD を出して seconds 秒続け、ジャンプボタンを離す */
  function bdFor(world: SimWorld, seconds: number) {
    startBd(world);
    run(world, seconds);
    jumpUp(world);
  }

  /** レバーを倒したまま BD して、BD とレバーを離す（レバーはニュートラルに戻る） */
  function leverBd(world: SimWorld, direction: LeverDirection, seconds: number) {
    setLever(world, direction, true);
    bdFor(world, seconds);
    setLever(world, direction, false);
  }

  describe('慣性ジャンプ', () => {
    it('BD → レバーを戻す → ジャンプとほぼ同時に同じ方向へ入れ直すと成立する', () => {
      const world = createWorld();
      holdJump(world, 0.15);
      leverBd(world, 'forward', 0.4);
      run(world, 0.05);
      jumpDown(world);
      run(world, 0.05);
      setLever(world, 'forward', true);
      expect(lastRoute(world)).toBe('慣性ジャンプ');
      run(world, 0.2);
      expect(speedXZ(world)).toBeGreaterThan(15);
      expect(world.mech.vel.y).toBeGreaterThan(0);
    });

    it('レバーをジャンプより少し先に入れ直しても成立する', () => {
      const world = createWorld();
      holdJump(world, 0.15);
      leverBd(world, 'left', 0.4);
      run(world, 0.05);
      setLever(world, 'left', true);
      run(world, 0.1);
      jumpDown(world);
      expect(lastRoute(world)).toBe('慣性ジャンプ');
    });

    it('レバーを戻さず入れっぱなしでも成立するが、入れ直したときより飛距離が短い', () => {
      function travel(reinput: boolean) {
        const world = createWorld();
        holdJump(world, 0.15);
        setLever(world, 'right', true);
        bdFor(world, 0.3);
        if (reinput) {
          setLever(world, 'right', false);
          run(world, 0.05);
          setLever(world, 'right', true);
        }
        const start = { ...world.mech.pos };
        jumpDown(world);
        const label = lastRoute(world);
        run(world, 0.3);
        jumpUp(world);
        run(world, 0.5);
        return { label, distance: Math.hypot(world.mech.pos.x - start.x, world.mech.pos.z - start.z) };
      }
      const held = travel(false);
      const full = travel(true);
      expect(held.label).toBe('慣性ジャンプ（入れっぱ）');
      expect(full.label).toBe('慣性ジャンプ');
      expect(held.distance).toBeLessThan(full.distance - 2);
    });

    it('レバーなしのジャンプは慣性ジャンプにならない', () => {
      const world = createWorld();
      holdJump(world, 0.15);
      leverBd(world, 'forward', 0.4);
      jumpDown(world);
      run(world, INERTIA_LEVER_WINDOW_S + 0.1);
      expect(world.events.some((e) => e.label.startsWith('慣性ジャンプ'))).toBe(false);
      expect(speedXZ(world)).toBeLessThan(1);
    });

    it('入れ直しはジャンプから 0.5 秒後でも間に合う', () => {
      const world = createWorld();
      holdJump(world, 0.15);
      leverBd(world, 'left', 0.4);
      jumpDown(world);
      run(world, 0.5);
      setLever(world, 'left', true);
      expect(lastRoute(world)).toBe('慣性ジャンプ');
    });

    it('BD と違う方向に入れ直したり、間が空きすぎたりすると成立しない', () => {
      const other = createWorld();
      holdJump(other, 0.15);
      leverBd(other, 'forward', 0.4);
      jumpDown(other);
      setLever(other, 'right', true);
      expect(other.events.some((e) => e.label.startsWith('慣性ジャンプ'))).toBe(false);

      const late = createWorld();
      holdJump(late, 0.15);
      leverBd(late, 'forward', 0.4);
      jumpDown(late);
      run(late, INERTIA_LEVER_WINDOW_S + 0.1);
      setLever(late, 'forward', true);
      expect(late.events.some((e) => e.label.startsWith('慣性ジャンプ'))).toBe(false);
    });

    it('普通のジャンプよりずっと進み、BD ほどは進まない', () => {
      function travel(setup: (world: SimWorld) => void) {
        const world = createWorld();
        holdJump(world, 0.15);
        const start = { ...world.mech.pos };
        setup(world);
        run(world, 0.8);
        return Math.hypot(world.mech.pos.x - start.x, world.mech.pos.z - start.z);
      }
      const inertia = travel((w) => {
        leverBd(w, 'right', 0.3);
        jumpDown(w);
        setLever(w, 'right', true);
        run(w, 0.3);
        jumpUp(w);
        setLever(w, 'right', false);
      });
      const plain = travel((w) => {
        leverBd(w, 'right', 0.3);
        run(w, 0.4);
        jumpDown(w);
        run(w, 0.3);
        jumpUp(w);
      });
      const bd = travel((w) => {
        setLever(w, 'right', true);
        bdFor(w, 1.1);
      });
      expect(inertia).toBeGreaterThan(plain + 8);
      expect(inertia).toBeLessThan(bd);
    });

    it('一度きり。離してもう一度押すとその場で跳ねるだけ', () => {
      const world = createWorld();
      holdJump(world, 0.15);
      leverBd(world, 'forward', 0.4);
      jumpDown(world);
      setLever(world, 'forward', true);
      run(world, 0.1);
      jumpUp(world);
      setLever(world, 'forward', false);
      run(world, 0.05);
      jumpDown(world);
      setLever(world, 'forward', true);
      const count = world.events.filter((e) => e.label === '慣性ジャンプ').length;
      expect(count).toBe(1);
    });
  });

  it('BD 旋回: BD 中にレバーを倒すと、その方向へ少しずつ曲がる', () => {
    const world = createWorld();
    startBd(world);
    const start = world.mech.bdDir!;
    setLever(world, 'right', true);
    run(world, 0.1);
    const early = world.mech.bdDir!;
    // 一瞬では真横を向かない
    expect(Math.abs(early.x)).toBeLessThan(0.6);
    run(world, 0.6);
    // しばらくすると右（+x）へ向く
    expect(world.mech.bdDir!.x).toBeGreaterThan(0.9);
    expect(start.z).toBeLessThan(-0.9);
  });

  it('BD 中は進む向きを向き、後ろ BD のあとの射撃は振り向き撃ちになる', () => {
    const world = createWorld();
    holdJump(world, 0.15);
    setLever(world, 'back', true);
    bdFor(world, 0.4);
    setLever(world, 'back', false);
    expect(Math.abs(world.mech.yaw - world.mech.lockYaw)).toBeGreaterThan(Math.PI / 2);
    applyInput(world, 'shot');
    expect(world.mech.turnShot).toBe(true);
    expect(lastRoute(world)).toBe('振り向き撃ち');
    // 振り向き撃ちは撃つまでに向き直りの時間がかかる
    run(world, ACTIONS.shot.fireAt! + FIXED_DT);
    expect(world.projectiles).toHaveLength(0);
    run(world, 0.3);
    expect(world.projectiles).toHaveLength(1);
  });

  it('移動撃ち: 前を向いて撃つ BR は慣性を殺さない', () => {
    const world = createWorld();
    holdJump(world, 0.15);
    bdFor(world, 0.3);
    applyInput(world, 'shot');
    expect(world.mech.turnShot).toBe(false);
    run(world, 0.1);
    expect(speedXZ(world)).toBeGreaterThan(15);
  });

  it('動き撃ちステップ: 撃つ前の BR からステップしても弾は出る', () => {
    const world = createWorld();
    applyInput(world, 'shot');
    run(world, 0.05);
    tapLever(world, 'left');
    expect(tapLever(world, 'left')).toBe('canceled');
    expect(lastRoute(world)).toBe('動き撃ちステップ');
    expect(world.projectiles).toHaveLength(1);
  });

  it('フワステ: ステップをジャンプでキャンセルすると、ステップの慣性で膨らんで飛ぶ', () => {
    const world = createWorld();
    tapLever(world, 'left');
    tapLever(world, 'left');
    run(world, 0.1);
    expect(jumpDown(world)).toBe('canceled');
    expect(lastRoute(world)).toBe('フワステ');
    run(world, 0.1);
    jumpUp(world);
    expect(speedXZ(world)).toBeGreaterThan(10);
    expect(world.mech.pos.y).toBeGreaterThan(0.5);
  });

  it('ふわふわ: 落下中にジャンプを一瞬押すと落下が止まって少し浮く', () => {
    const world = createWorld();
    holdJump(world, 0.5);
    run(world, 0.6);
    expect(world.mech.vel.y).toBeLessThan(0);
    const height = world.mech.pos.y;
    holdJump(world, 0.12);
    expect(lastRoute(world)).toBe('ふわふわ');
    expect(world.mech.pos.y).toBeGreaterThan(height);
  });

  it('BD ステ・ステ BD: BD とステップは互いにすぐキャンセルできる', () => {
    const world = createWorld();
    startBd(world);
    run(world, 0.1);
    tapLever(world, 'right');
    expect(tapLever(world, 'right')).toBe('canceled');
    expect(lastRoute(world)).toBe('BDステ');
    run(world, 0.05);
    expect(startBd(world)).toBe('canceled');
    expect(lastRoute(world)).toBe('ステBD');
  });

  it('アメキャン: 足の止まるサブを BR でキャンセルすると上昇を打ち消して落ちる', () => {
    const world = createWorld();
    holdJump(world, 0.3);
    applyInput(world, 'sub');
    run(world, ACTIONS.sub.fireAt! + FIXED_DT);
    world.mech.vel.y = 3;
    expect(applyInput(world, 'shot')).toBe('canceled');
    expect(lastRoute(world)).toBe('アメキャン');
    expect(world.mech.vel.y).toBeLessThanOrEqual(0);
  });

  it('滑り特射: ジャンプ直後にレバーを入れて特射を出すと、その方向へ滑る', () => {
    const world = createWorld();
    setLever(world, 'left', true);
    jumpDown(world);
    run(world, 0.05);
    applyInput(world, 'special-shot');
    expect(lastRoute(world)).toBe('滑り特射');
    run(world, 0.3);
    expect(world.mech.pos.x).toBeLessThan(-4);
  });

  it('レバーなしの特射は滑らない', () => {
    const world = createWorld();
    jumpDown(world);
    run(world, 0.05);
    applyInput(world, 'special-shot');
    run(world, 0.3);
    expect(Math.abs(world.mech.pos.x)).toBeLessThan(1);
  });

  it('ブーストを 3 回より多く吹かすと着地硬直が延びる', () => {
    function landingLagAfter(boosts: number) {
      const world = createWorld();
      holdJump(world, 0.2);
      for (let i = 1; i < boosts; i++) holdJump(world, 0.05);
      while (!world.mech.grounded) stepWorld(world, FIXED_DT);
      return world.mech.landingLag;
    }
    expect(landingLagAfter(2)).toBeCloseTo(LANDING_LAG_S, 1);
    expect(landingLagAfter(6)).toBeGreaterThan(LANDING_LAG_S + 0.2);
  });

  describe('誘導切り', () => {
    it('敵は一定間隔で誘導するビームを撃ち、当たると被弾が増える', () => {
      const world = createWorld({ enemyFires: true });
      run(world, ENEMY_FIRE_INTERVAL_S + 0.05);
      expect(world.projectiles.some((p) => p.owner === 'enemy')).toBe(true);
      run(world, 1.5);
      expect(world.mechHits).toBe(1);
    });

    it('ステップすると飛んできている弾の誘導が切れる', () => {
      const world = createWorld({ enemyFires: true });
      run(world, ENEMY_FIRE_INTERVAL_S + 0.05);
      tapLever(world, 'left');
      tapLever(world, 'left');
      expect(lastRoute(world)).toBe('誘導切り');
      expect(world.projectiles.filter((p) => p.owner === 'enemy').every((p) => p.homing === 0)).toBe(true);
    });

    it('BD では誘導は切れない', () => {
      const world = createWorld({ enemyFires: true });
      run(world, ENEMY_FIRE_INTERVAL_S + 0.05);
      startBd(world);
      expect(world.projectiles.filter((p) => p.owner === 'enemy').every((p) => p.homing > 0)).toBe(true);
    });
  });
});
