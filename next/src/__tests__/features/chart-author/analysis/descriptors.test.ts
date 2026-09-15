import { describe, it, expect } from 'vitest';
import {
  computeGlyphDescriptor,
  computeNormalizedLuminance,
  computeFillRatio,
  descriptorDistance,
  isEmptyGlyph,
} from '@/features/chart-author/analysis/descriptors';
import { GLYPH_DESCRIPTOR_LENGTH } from '@/features/chart-author/constants';
import type { PixelRegion } from '@/features/chart-author/types';

/** 灰色の画素領域を組む。level は 0..1 の明るさ */
function gray(
  width: number,
  height: number,
  level: (x: number, y: number) => number,
): PixelRegion {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = Math.round(level(x, y) * 255);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 左半分だけが明るいパターン。倍率で全体の明るさを変えられる */
function leftHalf(size: number, high: number, low: number): PixelRegion {
  return gray(size, size, (x) => (x < size / 2 ? high : low));
}

/** 上半分だけが明るいパターン */
function topHalf(size: number, high: number, low: number): PixelRegion {
  return gray(size, size, (_x, y) => (y < size / 2 ? high : low));
}

describe('computeGlyphDescriptor', () => {
  it('特徴ベクトルの長さは定数で固定される', () => {
    const d = computeGlyphDescriptor(leftHalf(16, 0.9, 0.05));
    expect(d.features).toHaveLength(GLYPH_DESCRIPTOR_LENGTH);
  });

  it('描画のある側の特徴量が高く、無い側が低い', () => {
    const d = computeGlyphDescriptor(leftHalf(16, 0.9, 0.05));
    // 8x8 グリッドの 1 行目: 左 4 セルが明るく、右 4 セルが暗い
    expect(d.features.slice(0, 4).every((v) => v > 0.9)).toBe(true);
    expect(d.features.slice(4, 8).every((v) => v < 0.1)).toBe(true);
  });

  it('一様な領域はインク割合が 0 になり、空セルと判別できる', () => {
    const d = computeGlyphDescriptor(gray(16, 16, () => 0.05));
    expect(d.inkRatio).toBe(0);
    expect(isEmptyGlyph(d)).toBe(true);
  });

  it('描画のある領域はインク割合が 0 より大きく、空セルと判別されない', () => {
    const d = computeGlyphDescriptor(leftHalf(16, 0.9, 0.05));
    expect(d.inkRatio).toBeCloseTo(0.5, 2);
    expect(isEmptyGlyph(d)).toBe(false);
  });

  it('大きさが違っても同じ模様なら同じ記述子になる', () => {
    const small = computeGlyphDescriptor(leftHalf(8, 0.9, 0.05));
    const large = computeGlyphDescriptor(leftHalf(40, 0.9, 0.05));
    expect(descriptorDistance(small, large)).toBeLessThan(0.02);
  });

  it('明るさが違っても同じ模様なら同じ記述子になる', () => {
    const bright = computeGlyphDescriptor(leftHalf(16, 1, 0.4));
    const dim = computeGlyphDescriptor(leftHalf(16, 0.6, 0.1));
    expect(descriptorDistance(bright, dim)).toBeLessThan(0.02);
  });

  it('画素を持たない領域は空セルとして扱う', () => {
    const d = computeGlyphDescriptor({ width: 0, height: 0, data: new Uint8ClampedArray(0) });
    expect(d.features).toHaveLength(GLYPH_DESCRIPTOR_LENGTH);
    expect(isEmptyGlyph(d)).toBe(true);
  });
});

describe('descriptorDistance', () => {
  it('同じ記述子同士の距離は 0', () => {
    const d = computeGlyphDescriptor(leftHalf(16, 0.9, 0.05));
    expect(descriptorDistance(d, d)).toBe(0);
  });

  it('異なる模様の距離は大きく、0..1 に収まる', () => {
    const a = computeGlyphDescriptor(leftHalf(16, 0.9, 0.05));
    const b = computeGlyphDescriptor(topHalf(16, 0.9, 0.05));
    const distance = descriptorDistance(a, b);
    expect(distance).toBeGreaterThan(0.5);
    expect(distance).toBeLessThanOrEqual(1);
  });

  it('距離は対称である', () => {
    const a = computeGlyphDescriptor(leftHalf(16, 0.9, 0.05));
    const b = computeGlyphDescriptor(topHalf(16, 0.9, 0.05));
    expect(descriptorDistance(a, b)).toBe(descriptorDistance(b, a));
  });
});

describe('computeNormalizedLuminance', () => {
  it('真っ黒は 0、真っ白は 1、中間は 0.5 付近', () => {
    expect(computeNormalizedLuminance(gray(4, 4, () => 0))).toBeCloseTo(0, 2);
    expect(computeNormalizedLuminance(gray(4, 4, () => 1))).toBeCloseTo(1, 2);
    expect(computeNormalizedLuminance(gray(4, 4, () => 0.5))).toBeCloseTo(0.5, 2);
  });

  it('色によらず輝度の重みで評価する（緑が最も明るい）', () => {
    const channel = (r: number, g: number, b: number): PixelRegion => ({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([r, g, b, 255]),
    });
    const green = computeNormalizedLuminance(channel(0, 255, 0));
    const red = computeNormalizedLuminance(channel(255, 0, 0));
    const blue = computeNormalizedLuminance(channel(0, 0, 255));
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it('画素を持たない領域は 0', () => {
    expect(computeNormalizedLuminance({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBe(0);
  });
});

describe('computeFillRatio', () => {
  it('左から 6 割が明るいゲージは充填率 0.6 付近', () => {
    const region = gray(10, 4, (x) => (x < 6 ? 0.9 : 0.05));
    expect(computeFillRatio(region)).toBeCloseTo(0.6, 2);
  });

  it('全て暗いゲージは 0、全て明るいゲージは 1', () => {
    expect(computeFillRatio(gray(10, 4, () => 0.03))).toBe(0);
    expect(computeFillRatio(gray(10, 4, () => 0.97))).toBe(1);
  });

  it('充填率は 0..1 に収まる', () => {
    const region = gray(10, 4, (x) => (x < 3 ? 0.8 : 0.1));
    const ratio = computeFillRatio(region);
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it('画素を持たない領域は 0', () => {
    expect(computeFillRatio({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBe(0);
  });
});
