/**
 * 検出器テストが共有する観測列の組み立て。
 * 実映像の代わりに、意図した変化だけを持つ SampleTimeline を手で作る。
 */
import { EMPTY_BANK } from '@/features/chart-author/analysis/glyphBank';
import { EMPTY_GLYPH } from '@/features/chart-author/constants';
import type {
  FrameSample,
  GlyphBank,
  HudCalibration,
  Rect,
  SampleTimeline,
  SlotSample,
  VideoKey,
  WeaponSlotCalibration,
} from '@/features/chart-author/types';

/** テスト用のフレーム間隔。読みやすさを優先して切りの良い値にする */
export const FRAME_MS = 100;

/** フレーム番号を時刻へ */
export function at(frameIndex: number): number {
  return frameIndex * FRAME_MS;
}

export const VIDEO_KEY: VideoKey = {
  fileName: 'clip.mp4',
  durationMs: 60_000,
  width: 1920,
  height: 1080,
};

const RECT: Rect = { x: 0.1, y: 0.1, width: 0.1, height: 0.05 };

export function slot(patch: Partial<WeaponSlotCalibration> = {}): WeaponSlotCalibration {
  return {
    id: 'slot-1',
    index: 0,
    inputType: 'shot',
    inputTypeSource: 'auto',
    ammoRect: RECT,
    digitCount: 2,
    buttonIndicatorRect: null,
    chargeRect: null,
    chargeKind: null,
    ...patch,
  };
}

export function calibrationOf(
  slots: readonly WeaponSlotCalibration[],
  glyphBank: GlyphBank = EMPTY_BANK,
): HudCalibration {
  return {
    videoKey: VIDEO_KEY,
    createdAt: '2026-01-01T00:00:00.000Z',
    slots,
    boostRect: RECT,
    glyphBank,
  };
}

export function slotSample(patch: Partial<SlotSample> = {}): SlotSample {
  return {
    slotId: 'slot-1',
    digits: [EMPTY_GLYPH, EMPTY_GLYPH],
    chargeOn: false,
    chargeMargin: 1,
    ...patch,
  };
}

export function frame(
  index: number,
  slots: readonly SlotSample[],
  boostFill = 1,
): FrameSample {
  return { tMs: at(index), slots, boostFill };
}

export function timelineOf(
  samples: readonly FrameSample[],
  opts: {
    gaps?: readonly (readonly [number, number])[];
    glyphBank?: GlyphBank;
    truncated?: boolean;
  } = {},
): SampleTimeline {
  return {
    videoKey: VIDEO_KEY,
    frameDurationMs: FRAME_MS,
    samples,
    gaps: opts.gaps ?? [],
    glyphBank: opts.glyphBank ?? EMPTY_BANK,
    truncated: opts.truncated ?? false,
  };
}
