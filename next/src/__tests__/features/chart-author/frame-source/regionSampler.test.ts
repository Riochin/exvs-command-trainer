import { describe, it, expect } from 'vitest';
import { createRegionSampler } from '@/features/chart-author/frame-source/regionSampler';
import type { RegionCanvasContext } from '@/features/chart-author/frame-source/types';
import type { Rect } from '@/features/chart-author/types';
import { calibrationOf, slot } from '../analysis/helpers';

/** drawImage に渡された切り出し矩形 */
type DrawCall = { sx: number; sy: number; sw: number; sh: number };

/**
 * canvas を持たない jsdom の代わりになるフェイク。
 * 直前の drawImage の切り出し矩形を画素の先頭 8 バイトへ埋め込み、
 * 「どの領域を読んだか」をテストから復元できるようにする。
 * 画素は 1 バイトなので、座標は 2 バイト（下位・上位）に分けて入れる。
 */
function fakeContext() {
  const draws: DrawCall[] = [];
  const reads: { width: number; height: number }[] = [];
  const canvas = { width: 0, height: 0 };

  const ctx = {
    canvas,
    drawImage(
      _source: CanvasImageSource,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
    ): void {
      draws.push({ sx, sy, sw, sh });
    },
    getImageData(_x: number, _y: number, width: number, height: number): ImageData {
      reads.push({ width, height });
      const data = new Uint8ClampedArray(width * height * 4);
      const last = draws[draws.length - 1];
      [last.sx, last.sy, last.sw, last.sh].forEach((value, index) => {
        data[index * 2] = value & 0xff;
        data[index * 2 + 1] = value >> 8;
      });
      return { width, height, data, colorSpace: 'srgb' } as ImageData;
    },
  } as unknown as RegionCanvasContext;

  return { ctx, draws, reads };
}

/** PixelRegion に埋め込まれた切り出し矩形を読み戻す */
function originOf(region: { data: Uint8ClampedArray }): DrawCall {
  const at = (index: number): number => region.data[index * 2] + (region.data[index * 2 + 1] << 8);
  return { sx: at(0), sy: at(1), sw: at(2), sh: at(3) };
}

const FRAME_1080P = { videoWidth: 1920, videoHeight: 1080 } as unknown as CanvasImageSource;
const FRAME_HALF = { videoWidth: 960, videoHeight: 540 } as unknown as CanvasImageSource;

const AMMO_RECT: Rect = { x: 0.1, y: 0.1, width: 0.1, height: 0.05 };
const CHARGE_RECT: Rect = { x: 0.3, y: 0.2, width: 0.05, height: 0.05 };
const BUTTON_RECT: Rect = { x: 0.4, y: 0.2, width: 0.05, height: 0.05 };

describe('regionSampler / 正規化座標の変換', () => {
  it('正規化座標をフレームの実解像度の画素へ変換する', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([slot({ digitCount: 1, ammoRect: AMMO_RECT })]);

    const regions = sampler.sample(FRAME_1080P, calibration);

    expect(originOf(regions.slots[0].ammoCells[0])).toEqual({
      sx: 192,
      sy: 108,
      sw: 192,
      sh: 54,
    });
  });

  it('解像度が変わっても同じ比率の領域を取り出す', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([slot({ digitCount: 1, ammoRect: AMMO_RECT })]);

    const regions = sampler.sample(FRAME_HALF, calibration);

    expect(originOf(regions.slots[0].ammoCells[0])).toEqual({ sx: 96, sy: 54, sw: 96, sh: 27 });
  });

  it('フレームの端を越える矩形は解像度の内側に収める', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([
      slot({ digitCount: 1, ammoRect: { x: 0.95, y: 0.5, width: 0.1, height: 0.1 } }),
    ]);

    const origin = originOf(sampler.sample(FRAME_1080P, calibration).slots[0].ammoCells[0]);

    expect(origin.sx + origin.sw).toBeLessThanOrEqual(1920);
    expect(origin.sy + origin.sh).toBeLessThanOrEqual(1080);
  });
});

describe('regionSampler / 桁セルの分割', () => {
  it('弾数領域を桁数ぶんのセルに分ける', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([slot({ digitCount: 3, ammoRect: AMMO_RECT })]);

    const cells = sampler.sample(FRAME_1080P, calibration).slots[0].ammoCells;

    expect(cells).toHaveLength(3);
    expect(cells.map((cell) => originOf(cell).sx)).toEqual([192, 256, 320]);
    expect(cells.map((cell) => originOf(cell).sw)).toEqual([64, 64, 64]);
  });

  it('セルは隙間なく並び、弾数領域の高さをそのまま使う', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([slot({ digitCount: 2, ammoRect: AMMO_RECT })]);

    const origins = sampler
      .sample(FRAME_1080P, calibration)
      .slots[0].ammoCells.map(originOf);

    expect(origins[0].sx + origins[0].sw).toBe(origins[1].sx);
    expect(origins.every((o) => o.sh === 54 && o.sy === 108)).toBe(true);
  });

  it('PixelRegion の画素数は width * height * 4', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([slot({ digitCount: 2, ammoRect: AMMO_RECT })]);

    const cell = sampler.sample(FRAME_1080P, calibration).slots[0].ammoCells[0];

    expect(cell.data).toHaveLength(cell.width * cell.height * 4);
    expect({ width: cell.width, height: cell.height }).toEqual({ width: 96, height: 54 });
  });
});

describe('regionSampler / 領域の取り出し', () => {
  const CALIBRATION = calibrationOf([
    slot({
      id: 'slot-1',
      digitCount: 1,
      ammoRect: AMMO_RECT,
      chargeRect: CHARGE_RECT,
      chargeKind: 'shot',
      buttonIndicatorRect: BUTTON_RECT,
    }),
    slot({ id: 'slot-2', index: 1, digitCount: 1, ammoRect: AMMO_RECT }),
  ]);

  it('CHARGE・ボタン表示・ブーストをそれぞれ取り出す', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });

    const regions = sampler.sample(FRAME_1080P, CALIBRATION);

    expect(originOf(regions.slots[0].charge!)).toMatchObject({ sx: 576, sy: 216 });
    expect(originOf(regions.slots[0].buttonIndicator!)).toMatchObject({ sx: 768, sy: 216 });
    expect(originOf(regions.boost)).toMatchObject({ sx: 192, sy: 108 });
  });

  it('矩形が未設定なら null を返す', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });

    const regions = sampler.sample(FRAME_1080P, CALIBRATION);

    expect(regions.slots[1].charge).toBeNull();
    expect(regions.slots[1].buttonIndicator).toBeNull();
  });

  it('スロットは校正の順に返る', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });

    const regions = sampler.sample(FRAME_1080P, CALIBRATION);

    expect(regions.slots.map((s) => s.slotId)).toEqual(['slot-1', 'slot-2']);
  });
});

describe('regionSampler / 負荷と安全性', () => {
  it('画面全体ではなく校正矩形の合計面積しか読まない', () => {
    const { ctx, reads } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([
      slot({ digitCount: 2, ammoRect: AMMO_RECT, chargeRect: CHARGE_RECT, chargeKind: 'shot' }),
    ]);

    sampler.sample(FRAME_1080P, calibration);

    const readPixels = reads.reduce((sum, r) => sum + r.width * r.height, 0);
    // 弾数 2 セル(96x54) + CHARGE(96x54) + ブースト(192x54) = 全画面 1920x1080 のごく一部
    expect(readPixels).toBe(96 * 54 * 3 + 192 * 54);
    expect(reads.some((r) => r.width === 1920 && r.height === 1080)).toBe(false);
  });

  it('呼び出しごとに独立したバッファを返す', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([slot({ digitCount: 1, ammoRect: AMMO_RECT })]);

    const first = sampler.sample(FRAME_1080P, calibration).slots[0].ammoCells[0];
    const second = sampler.sample(FRAME_1080P, calibration).slots[0].ammoCells[0];
    first.data[100] = 200;

    expect(second.data).not.toBe(first.data);
    expect(second.data[100]).toBe(0);
  });

  it('同じ呼び出しの中でも領域どうしがバッファを共有しない', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([slot({ digitCount: 2, ammoRect: AMMO_RECT })]);

    const cells = sampler.sample(FRAME_1080P, calibration).slots[0].ammoCells;

    expect(cells[0].data).not.toBe(cells[1].data);
  });

  it('dispose の後は sample を受け付けない', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });
    const calibration = calibrationOf([slot({ digitCount: 1, ammoRect: AMMO_RECT })]);

    sampler.dispose();

    expect(() => sampler.sample(FRAME_1080P, calibration)).toThrow();
  });

  it('dispose は何度呼んでも安全', () => {
    const { ctx } = fakeContext();
    const sampler = createRegionSampler({ context: ctx });

    sampler.dispose();

    expect(() => sampler.dispose()).not.toThrow();
  });
});
