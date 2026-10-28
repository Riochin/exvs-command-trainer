/**
 * 実際の入力の流れ（アケコンの判定 → sim）でズンダを打ったときの回帰テスト。
 *
 * PC キーボード（J / O / [ と WASD）もスマホも、同時押し・BD 判定はアケコン（ArcadeController）を通る。
 * ここではキーボードの keydown / keyup を送り、生の押下・解放と解釈済みの入力が sim に届く順序と遅れ
 * （射撃は 50ms の遅延、BD は 2 回目の押下から少し遅れて届く）をそのまま再現する。
 */
import { describe, it, expect, beforeEach, afterEach, vi, type TestContext } from 'vitest';
import type { LeverDirection, SimWorld } from '@/features/input-relay/sim/types';
import { createKeyboardHarness, type KeyboardHarness } from './keyboardHarness';

let h: KeyboardHarness;
let world: SimWorld;

/** 失敗したら、入力と状態の時系列を出す */
function setup({ onTestFailed }: TestContext) {
  vi.useFakeTimers();
  h = createKeyboardHarness();
  world = h.world;
  onTestFailed(() => {
    console.log(h.trace());
  });
}

const wait = (ms: number) => h.wait(ms);
const down = (key: string) => h.down(key);
const up = (key: string) => h.up(key);
const tap = (key: string, holdMs?: number) => h.tap(key, holdMs);
const bd = (holdMs?: number) => h.bd(holdMs);
const lever = (direction: LeverDirection, pressed: boolean) => h.lever(direction, pressed);
const labels = () => h.labels();

describe('キーボードのジャンプボタン', () => {
  beforeEach(setup);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('2 回続けて押すと BD になり、1 回目の押下で機体は浮かない', () => {
    down('[');
    wait(40);
    expect(world.mech.pos.y).toBe(0);
    up('[');
    wait(50);
    expect(world.mech.action).toBe('idle');
    down('[');
    wait(100);
    expect(world.mech.action).toBe('bd');
    up('[');
  });

  it('少し長押しするとジャンプになる', () => {
    down('[');
    wait(200);
    expect(world.mech.action).toBe('jump');
    expect(world.mech.pos.y).toBeGreaterThan(0.3);
    up('[');
  });

  it('短く 1 回だけ押したら、BD の 2 回目を待ってから小ジャンプする', () => {
    tap('[', 40);
    wait(300);
    expect(world.mech.action).not.toBe('bd');
    expect(world.mech.pos.y).toBeGreaterThan(0.3);
  });
});

describe('キーボードで打つズンダ', () => {
  beforeEach(setup);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('BR → BD → BR → BD → BR がズンダになり、慣性ジャンプにも振り向き撃ちにもならない（BD はレバーなし）', () => {
    tap('j');
    wait(250);
    bd();
    wait(60);
    tap('j');
    wait(250);
    bd();
    wait(60);
    tap('j');
    wait(400);
    expect(labels()).toContain('ズンダ 3発');
    expect(labels().some((l) => l.startsWith('慣性ジャンプ'))).toBe(false);
    expect(labels()).not.toContain('振り向き撃ち');
  });

  it('BR のあと少しゆっくり BD を入れても、着地硬直で途切れない', () => {
    tap('j');
    wait(330);
    bd();
    wait(60);
    tap('j');
    wait(330);
    bd();
    wait(60);
    tap('j');
    wait(400);
    expect(labels()).not.toContain('着地硬直');
    expect(labels()).toContain('ズンダ 3発');
  });

  it('横に BD するジグザグのズンダでも、振り向き撃ちにならない', () => {
    tap('j');
    wait(250);
    lever('right', true);
    bd();
    lever('right', false);
    wait(60);
    tap('j');
    wait(250);
    lever('left', true);
    bd();
    lever('left', false);
    wait(60);
    tap('j');
    wait(400);
    expect(labels()).not.toContain('振り向き撃ち');
    expect(labels()).toContain('ズンダ 3発');
  });

  it('レバーを入れたまま BD をつないでも、BD のつもりのジャンプ押下は慣性ジャンプにならない', () => {
    lever('right', true);
    tap('j');
    wait(250);
    bd();
    wait(60);
    tap('j');
    // BR が終わってから次の BD に入る、ゆっくりめのズンダ
    wait(700);
    bd();
    wait(60);
    tap('j');
    wait(400);
    lever('right', false);
    expect(labels().some((l) => l.startsWith('慣性ジャンプ'))).toBe(false);
  });

  it('同じ方向に BD するたびにレバーを入れ直しても、BD のつもりのジャンプ押下は慣性ジャンプにならない', () => {
    // 高く飛んでから、空中でズンダする
    tap('[', 900);
    lever('right', true);
    tap('j');
    wait(250);
    bd();
    lever('right', false);
    wait(60);
    tap('j');
    // BR が終わってから、レバーを入れ直して次の BD
    wait(450);
    lever('right', true);
    bd();
    lever('right', false);
    wait(60);
    tap('j');
    wait(400);
    expect(labels().some((l) => l.startsWith('慣性ジャンプ'))).toBe(false);
  });

  it('BD のあとにジャンプを 1 回だけ押してレバーを入れ直せば、今までどおり慣性ジャンプになる', () => {
    lever('right', true);
    bd(300);
    lever('right', false);
    wait(60);
    down('[');
    lever('right', true);
    wait(400);
    up('[');
    lever('right', false);
    wait(200);
    expect(labels()).toContain('慣性ジャンプ');
  });
});
