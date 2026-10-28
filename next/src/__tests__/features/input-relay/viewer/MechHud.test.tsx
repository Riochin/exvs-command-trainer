import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyInput, createWorld, FIXED_DT, stepWorld } from '@/features/input-relay/sim/step';
import type { SimEvent, SimWorld } from '@/features/input-relay/sim/types';
import { GQUUUUUUX, STRIKE_ROUGE_OOTORI, weaponPanelName } from '@/features/input-relay/sim/units';
import { MechHud } from '@/features/input-relay/viewer/MechHud';

function run(world: SimWorld, seconds: number) {
  for (let t = 0; t < seconds; t += FIXED_DT) stepWorld(world, FIXED_DT);
}

describe('weaponPanelName', () => {
  it('武装の固有名ではなく、押し方から共通の呼び名を出す', () => {
    expect(STRIKE_ROUGE_OOTORI.weapons.map(weaponPanelName)).toEqual([
      'ビームライフル',
      'サブ射撃',
      '特殊射撃',
      '後格闘',
      '格闘チャージ',
    ]);
    expect(GQUUUUUUX.weapons.map(weaponPanelName)).toContain('特殊格闘');
  });
});

describe('MechHud の武装パネル', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(unitId: string) {
    const world = createWorld({ unitId });
    render(<MechHud worldRef={{ current: world }} />);
    const refresh = () => act(() => vi.advanceTimersByTime(60));
    refresh();
    return { world, refresh };
  }

  const rows = () => within(screen.getByRole('list', { name: '武装' })).getAllByRole('listitem');

  it('行ごとに押すボタンを光らせる（サブは射撃＋格闘、後格はレバー後＋格闘）', () => {
    setup(STRIKE_ROUGE_OOTORI.id);
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual([
      'ビームライフル（射撃）',
      'サブ射撃（射撃＋格闘）',
      '特殊射撃（射撃＋ジャンプ）',
      '後格闘（後レバー＋格闘）',
      '格闘チャージ（格闘長押し）',
    ]);
    const lit = (row: HTMLElement) =>
      [...row.querySelectorAll('[data-button]')]
        .filter((b) => b.getAttribute('data-on') === 'true')
        .map((b) => b.getAttribute('data-button'));
    expect(lit(rows()[1])).toEqual(['shot', 'melee']);
    expect(lit(rows()[2])).toEqual(['shot', 'jump']);
    expect(within(rows()[4]).getAllByText('CHARGE!')).toHaveLength(2);
  });

  it('射撃を溜めているあいだ、メインの行の CHARGE ゲージが伸びる', () => {
    const { world, refresh } = setup(STRIKE_ROUGE_OOTORI.id);
    const gauge = () => screen.getAllByTestId('charge-gauge')[0];
    expect(gauge().dataset.ratio).toBe('0.00');
    applyInput(world, 'shot-charge-start');
    run(world, 1);
    refresh();
    expect(Number(gauge().dataset.ratio)).toBeCloseTo(0.5, 1);
    run(world, 1.1);
    refresh();
    expect(gauge().dataset.ratio).toBe('1.00');
    expect(gauge().closest('li')?.dataset.full).toBe('true');
  });

  it('時限強化中だけの行（オメガ中の鞭）は、強化していないと出さない', () => {
    const { world, refresh } = setup(GQUUUUUUX.id);
    const names = () => rows().map((r) => r.getAttribute('aria-label'));
    expect(names()).not.toContain('特殊格闘（格闘＋ジャンプ）');
    world.mech.seedTime = 10;
    refresh();
    expect(names()).toContain('特殊格闘（格闘＋ジャンプ）');
  });
});

describe('MechHud の中央の表示', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(events: Array<[SimEvent['kind'], string]>) {
    const world = createWorld({});
    world.time = 1;
    world.events = events.map(([kind, label], i) => ({ id: i + 1, kind, label, time: 1 }));
    render(<MechHud worldRef={{ current: world }} />);
    act(() => vi.advanceTimersByTime(60));
  }

  it('出さないルート名（BDC）は飛ばし、その前の出すルート名（ズンダ）を出す', () => {
    setup([
      ['route', 'ズンダ'],
      ['route', 'BDC'],
    ]);
    expect(screen.queryByText('ズンダ')).not.toBeNull();
    expect(screen.queryByText('BDC')).toBeNull();
  });

  it('SEED発現は「換装」と出す', () => {
    setup([['route', 'SEED発現']]);
    expect(screen.queryByText('換装')).not.toBeNull();
    expect(screen.queryByText('SEED発現')).toBeNull();
  });

  it('機体固有の理由は出さず、共通の理由は出す', () => {
    setup([
      ['reject', '弾切れ'],
      ['reject', 'オオトリ射出中'],
    ]);
    expect(screen.queryByText('× 弾切れ')).not.toBeNull();
    expect(screen.queryByText(/オオトリ射出中/)).toBeNull();
  });
});
