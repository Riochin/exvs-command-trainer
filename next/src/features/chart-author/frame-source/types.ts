/**
 * フレーム供給層の契約。
 *
 * この層だけが `HTMLVideoElement` と Canvas 2D に触れる。解析層は
 * ここが返す `SampledRegions`（DOM 非依存の画素バッファ）しか見ない。
 * 供給方式（再生 / シーク / 将来の WebCodecs）を差し替えても、
 * この契約より上は一切変わらないことが設計上の狙い。
 */
import type { HudCalibration, PixelRegion, SlotId } from '../types';

export type FrameHandle = {
  /** このフレームのメディア時刻（ms） */
  readonly tMs: number;
  /** canvas へ描画可能なソース */
  readonly source: CanvasImageSource;
  /** 直前のフレームからスキップされた枚数。0 なら連続 */
  readonly skippedFrames: number;
};

export type FrameSourceKind = 'playback' | 'seeking';

export interface FrameSource {
  readonly kind: FrameSourceKind;
  readonly durationMs: number;
  readonly frameDurationMs: number;
  /** 時刻順にフレームを供給する。呼び出し側は for await で消費する */
  frames(signal: AbortSignal): AsyncIterable<FrameHandle>;
  dispose(): void;
}

export type SampledSlotRegions = {
  readonly slotId: SlotId;
  /** 桁数ぶんに等分割済みのセル */
  readonly ammoCells: readonly PixelRegion[];
  readonly charge: PixelRegion | null;
  readonly buttonIndicator: PixelRegion | null;
};

export type SampledRegions = {
  readonly slots: readonly SampledSlotRegions[];
  readonly boost: PixelRegion;
};

export interface RegionSamplerService {
  sample(frame: CanvasImageSource, calibration: HudCalibration): SampledRegions;
  dispose(): void;
}

/**
 * RegionSampler が canvas に求める最小限の機能。
 * jsdom は canvas を実装しないため、テストはここへフェイクを差し込む。
 */
export type RegionCanvasContext = Pick<CanvasRenderingContext2D, 'drawImage' | 'getImageData'> & {
  readonly canvas: { width: number; height: number };
};
