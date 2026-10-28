import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyInput, createWorld, FIXED_DT, stepWorld } from '@/features/input-relay/sim/step';
import type { SimWorld } from '@/features/input-relay/sim/types';
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

describe('MechHud のタッチ操作向けの出し分け', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function renderHud(props: { showLever?: boolean; compact?: boolean }) {
    render(<MechHud worldRef={{ current: createWorld() }} {...props} />);
    act(() => vi.advanceTimersByTime(60));
    return screen.getByTestId('mech-hud');
  }

  it('ふだんはレバー表示を出し、小さな HUD にはしない', () => {
    const hud = renderHud({});
    expect(screen.queryByLabelText('レバー')).not.toBeNull();
    expect(hud.getAttribute('data-compact')).toBe('false');
  });

  it('タッチのスティックを出している間はレバー表示を消す', () => {
    renderHud({ showLever: false });
    expect(screen.queryByLabelText('レバー')).toBeNull();
  });

  it('タッチ操作中は小さな HUD の印を付ける（残弾とブーストは出したまま）', () => {
    const hud = renderHud({ compact: true });
    expect(hud.getAttribute('data-compact')).toBe('true');
    expect(screen.getByText(/BOOST/)).not.toBeNull();
  });
});
