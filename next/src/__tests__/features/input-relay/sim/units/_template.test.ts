import { describe, it, expect } from 'vitest';
import type { ActionDef } from '@/features/input-relay/sim/actions';
import type { MechAction } from '@/features/input-relay/sim/types';
import { isRejection, type ResolveContext } from '@/features/input-relay/sim/units';
import { TEMPLATE_UNIT } from '@/features/input-relay/sim/units/_template';
import { unitProblems } from './unitContract';

/**
 * 新しい機体のテストの雛形。`<機体id>.test.ts` にコピーし、UNIT を差し替えて使う。
 *
 * ここでは resolve（スロット×レバー → 技）だけを確かめる。弾数・キャンセル・アメキャンなど
 * world を動かすテストは UNITS に登録したあと、`../rouge.test.ts` と同じ形
 * （createWorld({ unitId }) → applyInput → stepWorld）で書く。
 */
const UNIT = TEMPLATE_UNIT;

function resolve(slot: MechAction, ctx: Partial<ResolveContext> = {}): ActionDef {
  const result = UNIT.resolve(slot, {
    lever: 'N',
    inBd: false,
    seed: false,
    packOut: false,
    seedCooldown: 0,
    assists: [],
    current: null,
    currentSlot: 'idle',
    ...ctx,
  });
  if (isRejection(result)) throw new Error(`${slot} は出せない: ${result.reject}`);
  return result;
}

describe(UNIT.name, () => {
  it('機体データの約束ごとを守っている', () => {
    expect(unitProblems(UNIT)).toEqual([]);
  });

  it('サブはレバーで技が変わる', () => {
    expect(resolve('sub').id).toBe('tpl-sub-n');
    expect(resolve('sub', { lever: 'side' }).id).toBe('tpl-sub-side');
  });

  it('BD 中の格闘は BD 格になる', () => {
    expect(resolve('melee', { inBd: true }).id).toBe('tpl-bd-melee');
  });

  it('N格の追加入力は次の段、後ろレバーなら後派生', () => {
    const n = resolve('melee');
    expect(resolve('melee', { current: n, currentSlot: 'melee' })).toBe(n);
    expect(resolve('melee', { lever: 'back', current: n, currentSlot: 'melee' }).id).toBe('tpl-back-derive');
  });

  it('メインのキャンセル先にサブと特射があり、格闘はない', () => {
    const into = resolve('shot').cancels?.into ?? [];
    expect(into).toContain('sub');
    expect(into).toContain('special-shot');
    expect(into).not.toContain('melee');
  });

  it('サブと特射はメインでアメキャンできる', () => {
    expect(resolve('sub').fallCancel).toBe(true);
    expect(resolve('special-shot').fallCancel).toBe(true);
  });

  it('持っていない武装は理由を返す', () => {
    expect(UNIT.resolve('melee-cs', { lever: 'N', inBd: false, seed: false, packOut: false, seedCooldown: 0, assists: [], current: null, currentSlot: 'idle' })).toEqual({
      reject: '格CS なし',
    });
  });
});
