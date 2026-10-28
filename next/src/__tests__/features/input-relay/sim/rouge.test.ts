import { describe, it, expect } from 'vitest';
import { applyInput, applyRawInput, createWorld, FIXED_DT, setLever, stepWorld } from '@/features/input-relay/sim/step';
import { STRIKE_ROUGE_OOTORI } from '@/features/input-relay/sim/units';
import type { LeverDirection, SimWorld } from '@/features/input-relay/sim/types';

function rougeWorld() {
  return createWorld({ unitId: STRIKE_ROUGE_OOTORI.id });
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

/** 技が出きるまで進める */
function untilFired(world: SimWorld) {
  for (let i = 0; i < 1000 && !world.mech.actionFired; i++) stepWorld(world, FIXED_DT);
}

describe('ストライクルージュ（オオトリ装備）', () => {
  it('メインは 8 発で、撃ち切ると弾切れ。3 秒で 1 発戻る', () => {
    const world = rougeWorld();
    for (let i = 0; i < 8; i++) {
      expect(applyInput(world, 'shot')).toBe('started');
      run(world, 0.5);
    }
    expect(world.mech.ammo.main.count).toBe(1);
    run(world, 30);
    world.mech.ammo.main.count = 0;
    expect(applyInput(world, 'shot')).toBe('rejected');
    expect(lastEvent(world).label).toBe('弾切れ');
    run(world, 3.05);
    expect(world.mech.ammo.main.count).toBe(1);
  });

  it('サブはレバーで構え撃ち・移動撃ち・照射に変わる。照射は 2 発使う', () => {
    const n = rougeWorld();
    applyInput(n, 'sub');
    expect(n.mech.move?.id).toBe('rouge-sub-n');

    const side = rougeWorld();
    withLever(side, 'left', () => applyInput(side, 'sub'));
    expect(side.mech.move?.id).toBe('rouge-sub-side');
    run(side, 0.3);
    // 横へ転がりながら撃つ
    expect(Math.abs(side.mech.pos.x)).toBeGreaterThan(2);

    const back = rougeWorld();
    withLever(back, 'back', () => applyInput(back, 'sub'));
    expect(back.mech.move?.id).toBe('rouge-sub-back');
    expect(back.mech.ammo.sub.count).toBe(0);
    run(back, 1.2);
    expect(back.projectiles.filter((p) => p.kind === 'laser').length + back.enemy.hitCount).toBeGreaterThanOrEqual(8);
  });

  it('メインからサブと後格にはキャンセルできるが、N格にはできない', () => {
    const toSub = rougeWorld();
    applyInput(toSub, 'shot');
    untilFired(toSub);
    expect(applyInput(toSub, 'sub')).toBe('canceled');

    const toN = rougeWorld();
    applyInput(toN, 'shot');
    untilFired(toN);
    expect(applyInput(toN, 'melee')).toBe('rejected');
    expect(lastEvent(toN).label).toBe('キャンセル不可');

    const toBack = rougeWorld();
    applyInput(toBack, 'shot');
    untilFired(toBack);
    withLever(toBack, 'back', () => expect(applyInput(toBack, 'melee')).toBe('canceled'));
    expect(toBack.mech.move?.id).toBe('rouge-ootori');
  });

  it('後格でオオトリを射出し、射出中はサブ・特格が使えず、格闘がナイフになる。戻ると元通り', () => {
    const world = rougeWorld();
    withLever(world, 'back', () => applyInput(world, 'melee'));
    untilFired(world);
    expect(world.mech.packOut).toBe(true);
    expect(world.assists.some((a) => a.kind === 'ootori')).toBe(true);
    run(world, 0.5);

    expect(applyInput(world, 'sub')).toBe('rejected');
    expect(lastEvent(world).label).toBe('オオトリ射出中');
    expect(applyInput(world, 'special-melee')).toBe('rejected');
    applyInput(world, 'melee');
    expect(world.mech.move?.id).toBe('rouge-knife-n');

    run(world, 4);
    expect(world.mech.packOut).toBe(false);
    expect(world.enemy.hitCount).toBeGreaterThan(0);
  });

  it('後格・特射・射CS はメインでキャンセルするとアメキャンで落ちる', () => {
    for (const setup of [
      (w: SimWorld) => withLever(w, 'back', () => applyInput(w, 'melee')),
      (w: SimWorld) => applyInput(w, 'special-shot'),
      (w: SimWorld) => applyInput(w, 'shot-charge-end'),
    ]) {
      const world = rougeWorld();
      applyRawInput(world, { button: 'jump', phase: 'down' });
      run(world, 0.3);
      applyRawInput(world, { button: 'jump', phase: 'up' });
      setup(world);
      untilFired(world);
      world.mech.vel.y = 4;
      expect(applyInput(world, 'shot')).toBe('canceled');
      expect(lastEvent(world).label).toBe('アメキャン');
      expect(world.mech.vel.y).toBeLessThanOrEqual(0);
    }
  });

  it('特射はフリーダムを呼び、N はビームを 2 連射、レバー入れは突撃して斬る', () => {
    const shot = rougeWorld();
    applyInput(shot, 'special-shot');
    run(shot, 1);
    expect(shot.assists.some((a) => a.kind === 'freedom-shot') || shot.enemy.hitCount > 0).toBe(true);
    run(shot, 1);
    expect(shot.enemy.hitCount).toBeGreaterThanOrEqual(2);
    expect(shot.mech.ammo.freedom.count).toBe(1);

    const melee = rougeWorld();
    withLever(melee, 'right', () => applyInput(melee, 'special-shot'));
    run(melee, 2.2);
    expect(melee.enemy.hitCount).toBe(3);
  });

  it('射CS のムラサメ 2 機は付いてきて、メインに合わせて撃つ', () => {
    const world = rougeWorld();
    applyInput(world, 'shot-charge-end');
    untilFired(world);
    expect(world.assists.filter((a) => a.kind === 'murasame')).toHaveLength(2);
    run(world, 1);
    const before = world.projectiles.length + world.enemy.hitCount;
    applyInput(world, 'shot');
    untilFired(world);
    expect(world.projectiles.length + world.enemy.hitCount - before).toBe(3);
    // 展開中はもう呼べない
    run(world, 0.5);
    expect(applyInput(world, 'shot-charge-end')).toBe('rejected');
  });

  it('格CS で SEED 発現。サブが全回復してレールガンも撃ち、メインから特格に、横特格も出せる', () => {
    const world = rougeWorld();
    world.mech.ammo.sub.count = 0;
    applyInput(world, 'melee-charge-end');
    untilFired(world);
    expect(world.mech.seedTime).toBeGreaterThan(0);
    expect(world.mech.ammo.sub.count).toBe(2);
    expect(lastEvent(world).label).toBe('SEED発現');
    run(world, 0.5);

    applyInput(world, 'sub');
    untilFired(world);
    expect(world.projectiles.some((p) => p.kind === 'rail')).toBe(true);
    run(world, 1);

    applyInput(world, 'shot');
    untilFired(world);
    withLever(world, 'left', () => expect(applyInput(world, 'special-melee')).toBe('canceled'));
    expect(world.mech.move?.id).toBe('rouge-side-special');

    // 発現中の格CS は小型ミサイル
    run(world, 1.5);
    applyInput(world, 'melee-charge-end');
    expect(world.mech.move?.id).toBe('rouge-missiles');
  });

  it('SEED が切れたら、しばらくは発現できない', () => {
    const world = rougeWorld();
    applyInput(world, 'melee-charge-end');
    run(world, (STRIKE_ROUGE_OOTORI.seedDuration ?? 20) + 1);
    expect(world.mech.seedTime).toBe(0);
    expect(applyInput(world, 'melee-charge-end')).toBe('rejected');
    expect(lastEvent(world).label).toBe('SEED チャージ中');
    run(world, STRIKE_ROUGE_OOTORI.seedCooldown ?? 15);
    expect(applyInput(world, 'melee-charge-end')).toBe('started');
  });

  it('N格は 3 段まで出せて、後ろレバーで後派生する', () => {
    const world = rougeWorld();
    world.mech.pos.z = -36;
    applyInput(world, 'melee');
    untilFired(world);
    expect(applyInput(world, 'melee')).toBe('canceled');
    expect(world.mech.meleeStage).toBe(2);
    untilFired(world);
    withLever(world, 'back', () => expect(applyInput(world, 'melee')).toBe('canceled'));
    expect(world.mech.move?.id).toBe('rouge-back-derive');
  });

  it('前格は 2 段、横格は回り込みながら踏み込む', () => {
    const front = rougeWorld();
    front.mech.pos.z = -36;
    withLever(front, 'forward', () => applyInput(front, 'melee'));
    expect(front.mech.move?.id).toBe('rouge-front-melee');
    untilFired(front);
    applyInput(front, 'melee');
    untilFired(front);
    expect(applyInput(front, 'melee')).toBe('rejected');

    const side = rougeWorld();
    withLever(side, 'right', () => applyInput(side, 'melee'));
    expect(side.mech.move?.id).toBe('rouge-side-melee');
    run(side, 0.3);
    expect(Math.abs(side.mech.pos.x)).toBeGreaterThan(1);
  });

  it('後特格で対艦刀を投げ、格闘で突き刺し派生に移れる', () => {
    const world = rougeWorld();
    withLever(world, 'back', () => applyInput(world, 'special-melee'));
    expect(world.mech.move?.id).toBe('rouge-sword-throw');
    untilFired(world);
    expect(world.projectiles.some((p) => p.kind === 'sword')).toBe(true);
    expect(applyInput(world, 'melee')).toBe('canceled');
    expect(world.mech.move?.id).toBe('rouge-throw-derive');
  });

  it('BD 中の格闘は BD 格になる', () => {
    const world = rougeWorld();
    applyRawInput(world, { button: 'jump', phase: 'down' });
    applyInput(world, 'bd');
    run(world, 0.1);
    applyInput(world, 'melee');
    expect(world.mech.move?.id).toBe('rouge-bd-melee');
  });

  it('BD 回数が多いぶん、汎用機よりブーストの減りが少ない', () => {
    const generic = createWorld();
    const rouge = rougeWorld();
    for (const world of [generic, rouge]) {
      applyRawInput(world, { button: 'jump', phase: 'down' });
      applyInput(world, 'bd');
      run(world, 0.5);
    }
    expect(rouge.mech.boost).toBeGreaterThan(generic.mech.boost + 8);
  });
});
