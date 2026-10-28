/**
 * フレームから校正矩形ぶんの画素だけを取り出す。
 *
 * 全画面を `getImageData` すると 1080p では 1 フレームあたり 800 万バイトを
 * 読むことになり、走査が現実的な時間に収まらない（Req 5.5）。ここでは
 * 校正された矩形の合計面積しか触らない。
 *
 * 画素の意味づけは一切行わない。数字か輝度かの解釈は analysis 層の仕事で、
 * この層の出口（PixelRegion）から先は DOM に依存しない。
 */
import type { HudCalibration, PixelRegion, Rect } from '../types';
import type {
  RegionCanvasContext,
  RegionSamplerService,
  SampledRegions,
  SampledSlotRegions,
} from './types';

export type CreateRegionSamplerOptions = {
  /** 省略時は自前の canvas を作る。テストはフェイクを渡す */
  readonly context?: RegionCanvasContext;
};

/** 画素座標の矩形。正規化座標（Rect）と取り違えないよう別の型にする */
type PixelRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type FrameSize = { readonly width: number; readonly height: number };

/**
 * フレームの実解像度を読む。
 * 供給方式によって渡ってくる実体が違う（video / canvas / ImageBitmap / VideoFrame）ため、
 * 持っている寸法の属性を順に見る。
 */
function frameSizeOf(frame: CanvasImageSource): FrameSize {
  const candidate = frame as Partial<{
    videoWidth: number;
    videoHeight: number;
    width: number;
    height: number;
    displayWidth: number;
    displayHeight: number;
  }>;

  const width = candidate.videoWidth ?? candidate.displayWidth ?? candidate.width;
  const height = candidate.videoHeight ?? candidate.displayHeight ?? candidate.height;

  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
    throw new Error('フレームの解像度を判定できません');
  }
  return { width, height };
}

/** 正規化座標を画素座標へ。フレームの外へはみ出す分は内側へ収める */
function toPixelRect(rect: Rect, frame: FrameSize): PixelRect {
  const x = Math.min(Math.max(Math.round(rect.x * frame.width), 0), frame.width - 1);
  const y = Math.min(Math.max(Math.round(rect.y * frame.height), 0), frame.height - 1);
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(rect.width * frame.width), frame.width - x)),
    height: Math.max(1, Math.min(Math.round(rect.height * frame.height), frame.height - y)),
  };
}

/** 弾数領域を桁数ぶんに等分割する。境界は丸めてもセル同士が重ならない */
function splitIntoCells(rect: PixelRect, digitCount: number): readonly PixelRect[] {
  const cells: PixelRect[] = [];
  for (let index = 0; index < digitCount; index += 1) {
    const start = Math.round((rect.width * index) / digitCount);
    const end = Math.round((rect.width * (index + 1)) / digitCount);
    cells.push({
      x: rect.x + start,
      y: rect.y,
      width: Math.max(1, end - start),
      height: rect.height,
    });
  }
  return cells;
}

export function createRegionSampler(
  options: CreateRegionSamplerOptions = {},
): RegionSamplerService {
  let context: RegionCanvasContext | null = options.context ?? createDefaultContext();

  /** 1 領域ぶんだけを canvas へ写して読み出す */
  function read(frame: CanvasImageSource, rect: PixelRect): PixelRegion {
    const ctx = context;
    if (ctx === null) throw new Error('dispose 済みの RegionSampler は使用できません');

    if (ctx.canvas.width < rect.width) ctx.canvas.width = rect.width;
    if (ctx.canvas.height < rect.height) ctx.canvas.height = rect.height;

    ctx.drawImage(frame, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const imageData = ctx.getImageData(0, 0, rect.width, rect.height);

    // 作業用 canvas は次の領域で上書きされる。必ず複製して独立したバッファを渡す
    return {
      width: rect.width,
      height: rect.height,
      data: new Uint8ClampedArray(imageData.data),
    };
  }

  function sample(frame: CanvasImageSource, calibration: HudCalibration): SampledRegions {
    const size = frameSizeOf(frame);

    const slots: SampledSlotRegions[] = calibration.slots.map((slot) => ({
      slotId: slot.id,
      ammoCells: splitIntoCells(toPixelRect(slot.ammoRect, size), slot.digitCount).map((cell) =>
        read(frame, cell),
      ),
      charge: slot.chargeRect === null ? null : read(frame, toPixelRect(slot.chargeRect, size)),
      buttonIndicator:
        slot.buttonIndicatorRect === null
          ? null
          : read(frame, toPixelRect(slot.buttonIndicatorRect, size)),
    }));

    return { slots, boost: read(frame, toPixelRect(calibration.boostRect, size)) };
  }

  function dispose(): void {
    if (context === null) return;
    // 作業用 canvas の画素を手放す
    context.canvas.width = 0;
    context.canvas.height = 0;
    context = null;
  }

  return { sample, dispose };
}

function createDefaultContext(): RegionCanvasContext {
  const canvas = document.createElement('canvas');
  // 毎フレーム読み出すので、GPU 側に置かせず CPU 読み出しに最適化させる
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('canvas 2D コンテキストを取得できません');
  return ctx;
}
