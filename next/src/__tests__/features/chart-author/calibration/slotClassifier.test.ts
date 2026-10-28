import { describe, it, expect } from 'vitest';
import { classifySlotInputType } from '@/features/chart-author/calibration/slotClassifier';
import type { PixelRegion } from '@/features/chart-author/types';

/** 3 つの丸を模した領域。lit は左から 射撃・格闘・ジャンプ の点灯有無 */
function indicator(
  lit: readonly [boolean, boolean, boolean],
  colors: readonly [number, number, number][] = [
    [255, 60, 60],
    [60, 60, 255],
    [60, 255, 60],
  ],
): PixelRegion {
  const width = 30;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = Math.min(2, Math.floor((x * 3) / width));
      const [r, g, b] = lit[cell] ? colors[cell] : [10, 10, 10];
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 白で点灯させた領域。色の手がかりを持たない場合の確認用 */
function whiteIndicator(lit: readonly [boolean, boolean, boolean]): PixelRegion {
  return indicator(lit, [
    [255, 255, 255],
    [255, 255, 255],
    [255, 255, 255],
  ]);
}

describe('classifySlotInputType', () => {
  it('射撃のみの点灯は shot', () => {
    expect(classifySlotInputType(indicator([true, false, false]))?.inputType).toBe('shot');
  });

  it('射撃と格闘の点灯は sub', () => {
    expect(classifySlotInputType(indicator([true, true, false]))?.inputType).toBe('sub');
  });

  it('射撃とジャンプの点灯は special-shot', () => {
    expect(classifySlotInputType(indicator([true, false, true]))?.inputType).toBe(
      'special-shot',
    );
  });

  it('格闘とジャンプの点灯は special-melee', () => {
    expect(classifySlotInputType(indicator([false, true, true]))?.inputType).toBe(
      'special-melee',
    );
  });

  it('どの丸も点灯していない場合は推定しない', () => {
    expect(classifySlotInputType(indicator([false, false, false]))).toBeNull();
  });

  it('対応する入力種別が無い点灯の組み合わせは推定しない', () => {
    expect(classifySlotInputType(indicator([false, true, false]))).toBeNull();
    expect(classifySlotInputType(indicator([false, false, true]))).toBeNull();
    expect(classifySlotInputType(indicator([true, true, true]))).toBeNull();
  });

  it('画素を持たない領域は推定しない', () => {
    expect(
      classifySlotInputType({ width: 0, height: 0, data: new Uint8ClampedArray(0) }),
    ).toBeNull();
  });

  it('確からしさは 0..1 に収まる', () => {
    const result = classifySlotInputType(indicator([true, false, false]));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('色の手がかりが無くても輝度だけで推定できる', () => {
    expect(classifySlotInputType(whiteIndicator([true, true, false]))?.inputType).toBe('sub');
  });

  it('色が想定どおりの場合は確からしさが上がる', () => {
    const colored = classifySlotInputType(indicator([true, false, false]));
    const white = classifySlotInputType(whiteIndicator([true, false, false]));
    expect(colored!.confidence).toBeGreaterThan(white!.confidence);
  });

  it('同じ画素に対して常に同じ結果を返す', () => {
    const region = indicator([true, false, true]);
    expect(classifySlotInputType(region)).toEqual(classifySlotInputType(region));
  });
});
