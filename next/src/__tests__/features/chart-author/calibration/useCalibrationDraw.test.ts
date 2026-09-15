import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCalibrationStore } from '@/features/chart-author/calibration/useCalibrationStore';
import { useCalibrationDraw } from '@/features/chart-author/calibration/useCalibrationDraw';
import type { PixelRegion, Rect, VideoKey } from '@/features/chart-author/types';

const VIDEO: VideoKey = {
  fileName: 'battle.mp4',
  durationMs: 60_000,
  width: 1920,
  height: 1080,
};

const AMMO: Rect = { x: 0.8, y: 0.2, width: 0.06, height: 0.04 };
const INDICATOR: Rect = { x: 0.75, y: 0.2, width: 0.04, height: 0.02 };
const CHARGE: Rect = { x: 0.88, y: 0.2, width: 0.03, height: 0.02 };
const BOOST: Rect = { x: 0.3, y: 0.9, width: 0.4, height: 0.02 };

/** 3 つの丸を模した領域。lit は左から 射撃・格闘・ジャンプ の点灯有無 */
function indicatorRegion(lit: readonly [boolean, boolean, boolean]): PixelRegion {
  const width = 30;
  const height = 10;
  const colors: readonly (readonly [number, number, number])[] = [
    [255, 60, 60],
    [60, 60, 255],
    [60, 255, 60],
  ];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = Math.min(2, Math.floor((x * 3) / width));
      const [r, g, b] = lit[cell] ? colors[cell] : ([10, 10, 10] as const);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function renderDraw(sampleIndicator?: (rect: Rect) => PixelRegion | null) {
  return renderHook(() => {
    const store = useCalibrationStore(VIDEO);
    return { store, draw: useCalibrationDraw(store, sampleIndicator) };
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useCalibrationDraw - 描画対象', () => {
  it('はじめは新しいスロットの弾数領域を描く', () => {
    const { result } = renderDraw();

    expect(result.current.draw.target).toEqual({ kind: 'slot_ammo' });
    expect(result.current.draw.activeLabel).toContain('弾数');
  });

  it('弾数領域を描くとスロットが増える', () => {
    const { result } = renderDraw();

    act(() => result.current.draw.draw(AMMO));

    expect(result.current.store.calibration?.slots).toHaveLength(1);
    expect(result.current.store.calibration?.slots[0].ammoRect).toEqual(AMMO);
  });

  it('弾数領域を描いたら、続けてそのスロットのボタン表示領域を描く対象になる', () => {
    const { result } = renderDraw();

    act(() => result.current.draw.draw(AMMO));

    const slotId = result.current.store.calibration?.slots[0].id;
    expect(result.current.draw.target).toEqual({ kind: 'slot_indicator', slotId });
  });

  it('ブーストゲージを描くと校正に反映される', () => {
    const { result } = renderDraw();

    act(() => result.current.draw.setTarget({ kind: 'boost' }));
    act(() => result.current.draw.draw(BOOST));

    expect(result.current.store.calibration?.boostRect).toEqual(BOOST);
  });

  it('CHARGE 領域を描くと対象のスロットに反映される', () => {
    const { result } = renderDraw();
    act(() => result.current.draw.draw(AMMO));
    const slotId = result.current.store.calibration?.slots[0].id ?? '';

    act(() => result.current.draw.setTarget({ kind: 'slot_charge', slotId }));
    act(() => result.current.draw.draw(CHARGE));

    expect(result.current.store.calibration?.slots[0].chargeRect).toEqual(CHARGE);
  });

  it('描き終えた矩形をラベルつきで重ねる対象として返す', () => {
    const { result } = renderDraw();
    act(() => result.current.draw.draw(AMMO));
    act(() => result.current.draw.setTarget({ kind: 'boost' }));
    act(() => result.current.draw.draw(BOOST));

    const variants = result.current.draw.rects.map((r) => r.variant);
    expect(variants).toContain('ammo');
    expect(variants).toContain('boost');
  });
});

describe('useCalibrationDraw - 入力種別の推定', () => {
  it('ボタン表示領域から入力種別を推定してスロットへ反映する', () => {
    const { result } = renderDraw(() => indicatorRegion([true, true, false]));
    act(() => result.current.draw.draw(AMMO));
    const slotId = result.current.store.calibration?.slots[0].id ?? '';

    act(() => result.current.draw.draw(INDICATOR));

    const slot = result.current.store.calibration?.slots[0];
    expect(slot?.buttonIndicatorRect).toEqual(INDICATOR);
    expect(slot?.inputType).toBe('sub');
    expect(slot?.inputTypeSource).toBe('auto');
    expect(result.current.draw.classifications[slotId]?.confidence).toBeGreaterThan(0);
  });

  it('画素を取り出せない環境では種別を推定しない', () => {
    const { result } = renderDraw(() => null);
    act(() => result.current.draw.draw(AMMO));
    const slotId = result.current.store.calibration?.slots[0].id ?? '';

    act(() => result.current.draw.draw(INDICATOR));

    expect(result.current.store.calibration?.slots[0].buttonIndicatorRect).toEqual(INDICATOR);
    expect(result.current.draw.classifications[slotId]).toBeNull();
  });

  it('推定できない点灯の組み合わせでは種別を書き換えない', () => {
    const { result } = renderDraw(() => indicatorRegion([false, false, false]));
    act(() => result.current.draw.draw(AMMO));
    const before = result.current.store.calibration?.slots[0].inputType;

    act(() => result.current.draw.draw(INDICATOR));

    expect(result.current.store.calibration?.slots[0].inputType).toBe(before);
  });
});
