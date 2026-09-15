import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalibrationPanel } from '@/features/chart-author/calibration/CalibrationPanel';
import { useCalibrationStore } from '@/features/chart-author/calibration/useCalibrationStore';
import { useCalibrationDraw } from '@/features/chart-author/calibration/useCalibrationDraw';
import { MAX_WEAPON_SLOTS } from '@/features/chart-author/constants';
import type { Rect, VideoKey } from '@/features/chart-author/types';

const VIDEO: VideoKey = {
  fileName: 'battle.mp4',
  durationMs: 60_000,
  width: 1920,
  height: 1080,
};

const AMMO: Rect = { x: 0.8, y: 0.2, width: 0.06, height: 0.04 };
const BOOST: Rect = { x: 0.3, y: 0.9, width: 0.4, height: 0.02 };

/**
 * 校正のフックを実物のまま束ねて panel を描く。
 * フックを動かしたら描き直すところまでを `update` に閉じ込める。
 */
function renderPanel(videoKey: VideoKey | null = VIDEO) {
  const onStartAnalysis = vi.fn();
  const hooks = renderHook(() => {
    const store = useCalibrationStore(videoKey);
    return { store, draw: useCalibrationDraw(store) };
  });

  const element = () => (
    <CalibrationPanel
      store={hooks.result.current.store}
      draw={hooks.result.current.draw}
      onStartAnalysis={onStartAnalysis}
    />
  );

  const view = render(element());

  const update = (run: () => void): void => {
    act(run);
    view.rerender(element());
  };

  return { ...view, hooks, update, onStartAnalysis };
}

/** 必須領域を描き終えた状態にする */
function completeCalibration(panel: ReturnType<typeof renderPanel>): void {
  panel.update(() => panel.hooks.result.current.draw.draw(AMMO));
  panel.update(() => panel.hooks.result.current.draw.setTarget({ kind: 'boost' }));
  panel.update(() => panel.hooks.result.current.draw.draw(BOOST));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('CalibrationPanel - 解析開始の可否', () => {
  it('必須領域が不足している間は解析を開始できない', () => {
    renderPanel();

    expect(screen.getByTestId('calibration-start').hasAttribute('disabled')).toBe(true);
  });

  it('不足している項目を列挙して表示する', () => {
    renderPanel();

    const defects = screen.getByTestId('calibration-defects');
    expect(defects.textContent).toContain('武器スロット');
    expect(defects.textContent).toContain('ブーストゲージ');
  });

  it('必須領域が揃うと解析を開始できる', () => {
    const panel = renderPanel();

    completeCalibration(panel);

    expect(screen.getByTestId('calibration-start').hasAttribute('disabled')).toBe(false);
    expect(screen.queryByTestId('calibration-defects')).toBeNull();

    fireEvent.click(screen.getByTestId('calibration-start'));
    expect(panel.onStartAnalysis).toHaveBeenCalledTimes(1);
  });

  it('スロットの桁数を壊すと再び開始できなくなる', () => {
    const panel = renderPanel();
    completeCalibration(panel);
    const slotId = panel.hooks.result.current.store.calibration?.slots[0].id ?? '';

    panel.update(() =>
      panel.hooks.result.current.store.updateSlot(slotId, { digitCount: 0 }),
    );

    expect(screen.getByTestId('calibration-start').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('calibration-defects').textContent).toContain('桁数');
  });
});

describe('CalibrationPanel - 描画対象の選択', () => {
  it('新しいスロットとブーストゲージを描く対象に選べる', () => {
    const panel = renderPanel();

    panel.update(() =>
      fireEvent.click(screen.getByRole('button', { name: 'ブーストゲージを描く' })),
    );
    expect(panel.hooks.result.current.draw.target).toEqual({ kind: 'boost' });

    panel.update(() =>
      fireEvent.click(screen.getByRole('button', { name: '新しいスロットの弾数領域を描く' })),
    );
    expect(panel.hooks.result.current.draw.target).toEqual({ kind: 'slot_ammo' });
  });

  it('矩形を描くとスロットが増え、一覧に現れる', () => {
    const panel = renderPanel();

    panel.update(() => panel.hooks.result.current.draw.draw(AMMO));

    expect(screen.getAllByTestId(/^slot-row-/)).toHaveLength(1);
  });

  it('スロットが上限に達したら新しいスロットを描けない', () => {
    const panel = renderPanel();

    for (let i = 0; i < MAX_WEAPON_SLOTS; i += 1) {
      panel.update(() => panel.hooks.result.current.draw.setTarget({ kind: 'slot_ammo' }));
      panel.update(() => panel.hooks.result.current.draw.draw(AMMO));
    }

    expect(
      screen
        .getByRole('button', { name: '新しいスロットの弾数領域を描く' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('CalibrationPanel - 再利用の提案', () => {
  it('保存済みの校正がなければ何も提案しない', () => {
    renderPanel();

    expect(screen.queryByTestId('calibration-reuse')).toBeNull();
  });

  it('動画が読み込まれていなければ校正を編集できない', () => {
    renderPanel(null);

    expect(
      screen
        .getByRole('button', { name: '新しいスロットの弾数領域を描く' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
});
