import { describe, it, expect } from 'vitest';
import { applyInput, applyRawInput, createWorld, FIXED_DT, setLever, stepWorld } from '@/features/input-relay/sim/step';
import { GQUUUUUUX } from '@/features/input-relay/sim/units';
import type { LeverDirection, SimWorld } from '@/features/input-relay/sim/types';

/** 満タンまで溜めた状態にして離す（CS は満タンでだけ出る） */
function releaseCharge(world: SimWorld, kind: 'shot' | 'melee') {
  world.mech.charging[kind] = true;
  world.mech.chargeSince[kind] = world.time - 10;
  return applyInput(world, kind === 'shot' ? 'shot-charge-end' : 'melee-charge-end');
}

function gqxWorld() {
  return createWorld({ unitId: GQUUUUUUX.id });
}

function run(world: SimWorld, seconds: number) {
  for (let t = 0; t < seconds; t += FIXED_DT) stepWorld(world, FIXED_DT);
}

function withLever(world: SimWorld, direction: LeverDirection, fn: () => void) {
  setLever(world, direction, true);
  fn();
  setLever(world, direction, false);
}

function lastEvent(world: SimWorld) {
  return world.events[world.events.length - 1];
}

function untilFired(world: SimWorld) {
  for (let i = 0; i < 1000 && !world.mech.actionFired; i++) stepWorld(world, FIXED_DT);
}

/** ジャンプして空中に上がる */
function jumpUp(world: SimWorld) {
  applyRawInput(world, { button: 'jump', phase: 'down' });
  run(world, 0.3);
  applyRawInput(world, { button: 'jump', phase: 'up' });
}

/** エスビットを展開し終えたところまで進める */
function deployEsbit(world: SimWorld) {
  applyInput(world, 'sub');
  untilFired(world);
  run(world, 0.6);
}

function esbits(world: SimWorld) {
  return world.assists.filter((a) => a.kind === 'esbit');
}

describe('GQuuuuuuX', () => {
  it('メインは 8 発で、3 秒で 1 発戻る', () => {
    const world = gqxWorld();
    expect(world.mech.ammo.main.count).toBe(8);
    world.mech.ammo.main.count = 0;
    expect(applyInput(world, 'shot')).toBe('rejected');
    run(world, 3.05);
    expect(world.mech.ammo.main.count).toBe(1);
  });

  it('サブでエスビット 2 基を展開し、展開中はメインとサブの再入力で撃つ', () => {
    const world = gqxWorld();
    deployEsbit(world);
    expect(esbits(world)).toHaveLength(2);
    expect(world.mech.ammo.sub.count).toBe(0);

    // メインに連動して 2 基とも撃つ
    let before = world.projectiles.length + world.enemy.hitCount;
    applyInput(world, 'shot');
    untilFired(world);
    expect(world.projectiles.length + world.enemy.hitCount - before).toBe(3);
    run(world, 0.6);

    // サブの再入力はエスビットだけが撃つ
    before = world.projectiles.length + world.enemy.hitCount;
    expect(applyInput(world, 'sub')).toBe('started');
    expect(world.mech.move?.id).toBe('gqx-esbit-fire');
    untilFired(world);
    expect(world.projectiles.length + world.enemy.hitCount - before).toBe(2);
  });

  it('エスビットは 15 秒で消え、消えてから 14 秒でサブが戻る', () => {
    const world = gqxWorld();
    deployEsbit(world);
    run(world, 15);
    expect(esbits(world)).toHaveLength(0);
    expect(world.mech.ammo.sub.count).toBe(0);
    run(world, 14.1);
    expect(world.mech.ammo.sub.count).toBe(1);
  });

  it('展開中の後サブはエスビットを投げて展開を解除し、格闘でジャンプ斬りに派生する', () => {
    const world = gqxWorld();
    world.mech.pos.z = -36;
    deployEsbit(world);
    withLever(world, 'back', () => applyInput(world, 'sub'));
    expect(world.mech.move?.id).toBe('gqx-esbit-throw');
    untilFired(world);
    expect(esbits(world)).toHaveLength(0);
    expect(world.projectiles.some((p) => p.kind === 'bit')).toBe(true);
    expect(applyInput(world, 'melee')).toBe('canceled');
    expect(world.mech.move?.id).toBe('gqx-jump-slash');
  });

  it('特射は GFreD を呼ぶ。N はライフル 3 射、レバー入れは突撃して 3 回斬る', () => {
    const shot = gqxWorld();
    applyInput(shot, 'special-shot');
    expect(shot.mech.move?.id).toBe('gqx-gfred-shot');
    run(shot, 2);
    expect(shot.enemy.hitCount).toBe(3);

    const melee = gqxWorld();
    withLever(melee, 'right', () => applyInput(melee, 'special-shot'));
    expect(melee.mech.move?.id).toBe('gqx-gfred-melee');
    run(melee, 2.2);
    expect(melee.enemy.hitCount).toBe(3);
  });

  it('GFreD は撃ち切りで、消えてから 7 秒で戻る。GFreD が出ているあいだはエスビットを展開できない', () => {
    const world = gqxWorld();
    applyInput(world, 'special-shot');
    untilFired(world);
    expect(world.mech.ammo.gfred.count).toBe(0);
    run(world, 0.5);
    expect(applyInput(world, 'sub')).toBe('rejected');
    expect(lastEvent(world).label).toBe('GFreD 出撃中');
    // GFreD が消えるまではリロードしない
    for (let i = 0; i < 1000 && world.assists.some((a) => a.kind === 'gfred-shot'); i++) stepWorld(world, FIXED_DT);
    expect(world.mech.ammo.gfred.count).toBe(0);
    run(world, 6.8);
    expect(world.mech.ammo.gfred.count).toBe(0);
    run(world, 0.3);
    expect(world.mech.ammo.gfred.count).toBe(1);
  });

  it('特射と特格（特殊移動）はメインでキャンセルすると落ちる', () => {
    for (const setup of [
      (w: SimWorld) => applyInput(w, 'special-shot'),
      (w: SimWorld) => applyInput(w, 'special-melee'),
    ]) {
      const world = gqxWorld();
      jumpUp(world);
      setup(world);
      untilFired(world);
      world.mech.vel.y = 4;
      expect(applyInput(world, 'shot')).toBe('canceled');
      expect(world.mech.vel.y).toBeLessThanOrEqual(0);
    }
  });

  it('エスビット展開中は、特射・射CS をサブでキャンセルして落ちる（アサキャン）', () => {
    for (const setup of [(w: SimWorld) => applyInput(w, 'special-shot'), (w: SimWorld) => releaseCharge(w, 'shot')]) {
      const world = gqxWorld();
      deployEsbit(world);
      jumpUp(world);
      setup(world);
      untilFired(world);
      world.mech.vel.y = 4;
      expect(applyInput(world, 'sub')).toBe('canceled');
      expect(world.mech.move?.id).toBe('gqx-esbit-fire');
      expect(lastEvent(world).label).toBe('アサキャン');
      expect(world.mech.vel.y).toBeLessThanOrEqual(0);
    }
  });

  it('特格はレバーで前・横・後ろへ動き、連続で出せる。格闘でヒート・ホークの斬り払いに派生する', () => {
    const forward = gqxWorld();
    const startZ = forward.mech.pos.z;
    applyInput(forward, 'special-melee');
    expect(forward.mech.move?.id).toBe('gqx-move-n');
    run(forward, 0.3);
    // 敵（-z 側）へ近づく
    expect(forward.mech.pos.z).toBeLessThan(startZ - 2);

    const back = gqxWorld();
    withLever(back, 'back', () => applyInput(back, 'special-melee'));
    expect(back.mech.move?.id).toBe('gqx-move-back');
    run(back, 0.3);
    expect(back.mech.pos.z).toBeGreaterThan(startZ + 2);

    const side = gqxWorld();
    withLever(side, 'left', () => applyInput(side, 'special-melee'));
    untilFired(side);
    withLever(side, 'left', () => expect(applyInput(side, 'special-melee')).toBe('canceled'));
    expect(Math.abs(side.mech.pos.x)).toBeGreaterThan(1);
    untilFired(side);
    expect(applyInput(side, 'melee')).toBe('canceled');
    expect(side.mech.move?.id).toBe('gqx-hawk-slash');
  });

  it('後格はヒート・ホーク投擲で、特格にキャンセルできる', () => {
    const world = gqxWorld();
    withLever(world, 'back', () => applyInput(world, 'melee'));
    expect(world.mech.move?.id).toBe('gqx-hawk');
    untilFired(world);
    expect(world.projectiles.some((p) => p.kind === 'heat-hawk')).toBe(true);
    expect(applyInput(world, 'special-melee')).toBe('canceled');
  });

  it('メインから各サブ・特射・特格・後格にキャンセルでき、N格にはできない', () => {
    for (const [lever, slot, expected] of [
      [null, 'sub', 'gqx-esbit-deploy'],
      [null, 'special-shot', 'gqx-gfred-shot'],
      [null, 'special-melee', 'gqx-move-n'],
      ['back', 'melee', 'gqx-hawk'],
    ] as const) {
      const world = gqxWorld();
      applyInput(world, 'shot');
      untilFired(world);
      const input = () => expect(applyInput(world, slot)).toBe('canceled');
      if (lever) withLever(world, lever, input);
      else input();
      expect(world.mech.move?.id).toBe(expected);
    }
    const toN = gqxWorld();
    applyInput(toN, 'shot');
    untilFired(toN);
    expect(applyInput(toN, 'melee')).toBe('rejected');
  });

  it('N格は 3 段で、前で蹴り抜け、後ろで巴投げに派生する', () => {
    const front = gqxWorld();
    front.mech.pos.z = -36;
    applyInput(front, 'melee');
    untilFired(front);
    withLever(front, 'forward', () => expect(applyInput(front, 'melee')).toBe('canceled'));
    expect(front.mech.move?.id).toBe('gqx-front-derive');

    const back = gqxWorld();
    back.mech.pos.z = -36;
    applyInput(back, 'melee');
    untilFired(back);
    withLever(back, 'back', () => expect(applyInput(back, 'melee')).toBe('canceled'));
    expect(back.mech.move?.id).toBe('gqx-back-derive');
  });

  describe('オメガ・サイコミュ解放（格CS）', () => {
    function omegaWorld() {
      const world = gqxWorld();
      world.enemy.moves = false;
      releaseCharge(world, 'melee');
      untilFired(world);
      run(world, 0.6);
      return world;
    }

    it('17 秒続き、終わってから 14 秒は使えない', () => {
      const world = omegaWorld();
      expect(world.mech.seedTime).toBeGreaterThan(0);
      expect(releaseCharge(world, 'melee')).toBe('rejected');
      expect(lastEvent(world).label).toBe('オメガ・サイコミュ解放中');
      run(world, 17);
      expect(world.mech.seedTime).toBe(0);
      expect(releaseCharge(world, 'melee')).toBe('rejected');
      expect(lastEvent(world).label).toBe('オメガ・サイコミュ チャージ中');
      run(world, 14);
      expect(releaseCharge(world, 'melee')).toBe('started');
    });

    it('射CS は N で最大出力、横で移動連射になる', () => {
      const n = omegaWorld();
      releaseCharge(n, 'shot');
      expect(n.mech.move?.id).toBe('gqx-cs-max');

      const side = omegaWorld();
      withLever(side, 'right', () => releaseCharge(side, 'shot'));
      expect(side.mech.move?.id).toBe('gqx-cs-roll');
      run(side, 0.6);
      expect(Math.abs(side.mech.pos.x)).toBeGreaterThan(2);
    });

    it('後格は斬り抜けになり、メインからキャンセルできて、前派生は連続斬り抜け', () => {
      const world = omegaWorld();
      world.mech.pos.z = -36;
      applyInput(world, 'shot');
      untilFired(world);
      withLever(world, 'back', () => expect(applyInput(world, 'melee')).toBe('canceled'));
      expect(world.mech.move?.id).toBe('gqx-seed-slash');
      untilFired(world);
      withLever(world, 'forward', () => expect(applyInput(world, 'melee')).toBe('canceled'));
      expect(world.mech.move?.id).toBe('gqx-front-derive-seed');
    });

    it('特格は鞭（2 発、撃ち切り 5 秒）。長いリーチで当たり、当たる前の特格で突撃掴みに派生する', () => {
      const world = omegaWorld();
      // 敵（z=-40）まで 7 m。普通の格闘の判定（5 m）は届かない距離
      world.mech.pos.z = -33;
      applyInput(world, 'special-melee');
      expect(world.mech.move?.id).toBe('gqx-whip-n');
      expect(world.mech.ammo.whip.count).toBe(1);
      expect(applyInput(world, 'special-melee')).toBe('canceled');
      expect(world.mech.move?.id).toBe('gqx-grab');

      const reach = omegaWorld();
      reach.mech.pos.z = -33;
      const hits = reach.enemy.hitCount;
      withLever(reach, 'back', () => applyInput(reach, 'special-melee'));
      expect(reach.mech.move?.id).toBe('gqx-whip-back');
      untilFired(reach);
      expect(reach.enemy.hitCount).toBe(hits + 1);
      run(reach, 1);
      applyInput(reach, 'special-melee');
      expect(reach.mech.ammo.whip.count).toBe(0);
      run(reach, 5.1);
      expect(reach.mech.ammo.whip.count).toBe(2);
    });
  });

  it('BD 回数 7 のぶん、汎用機よりブーストの減りが少ない', () => {
    const generic = createWorld();
    const gqx = gqxWorld();
    for (const world of [generic, gqx]) {
      applyRawInput(world, { button: 'jump', phase: 'down' });
      applyInput(world, 'bd');
      run(world, 0.5);
    }
    expect(gqx.mech.boost).toBeGreaterThan(generic.mech.boost + 5);
  });
});
