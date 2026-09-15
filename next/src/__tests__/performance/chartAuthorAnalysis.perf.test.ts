/**
 * 解析の性能目標の実測（Req 4.5, 5.5, 5.6）。
 *
 * 動画のデコードと canvas はこの実行環境に無いので、測れるのは
 * 「取り出した画素を観測値へ還元する費用」と「観測値から検出を導く費用」の
 * 2 つ。デコード込みの通し時間は実ブラウザでの計測が要るため、結果と手順を
 * `.kiro/specs/chart-authoring-tool/performance.md` に記録する。
 *
 * 閾値は要件そのままの値を使う。環境差で揺れる余地を残さないよう、
 * 目標より十分に速いことを前提に置く。
 */
import { describe, it, expect } from 'vitest';
import { reduceFrame } from '@/features/chart-author/analysis-run/useAnalysisRun';
import { EMPTY_BANK } from '@/features/chart-author/analysis/glyphBank';
import { runDetectors } from '@/features/chart-author/analysis/runDetectors';
import {
  DEFAULT_ANALYSIS_PARAMS,
  SCAN_YIELD_INTERVAL_FRAMES,
} from '@/features/chart-author/constants';
import type {
  FrameSample,
  GlyphBank,
  HudCalibration,
  PixelRegion,
  SampleTimeline,
  SlotSample,
  VideoKey,
  WeaponSlotCalibration,
} from '@/features/chart-author/types';
import type { SampledRegions } from '@/features/chart-author/frame-source/types';

/** 60 秒 / 30fps。要件が挙げる基準のクリップ 1 本ぶん */
const FRAME_COUNT = 1_800;
const FRAME_MS = 1000 / 30;
const SLOT_COUNT = 5;
const DIGITS_PER_SLOT = 2;

/** 1080p の HUD でありそうな領域の大きさ */
const AMMO_CELL = { width: 22, height: 26 };
const CHARGE_REGION = { width: 64, height: 20 };
const BOOST_REGION = { width: 420, height: 14 };

/** 検出の再実行に許される時間（Req 4.5） */
const RERUN_BUDGET_MS = 500;
/** 1 度もメインスレッドを手放さずに走ってよい時間（Req 5.6） */
const LONG_TASK_BUDGET_MS = 50;

function region(width: number, height: number, paint: (x: number, y: number) => number): PixelRegion {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 見え方の違う桁セル。クラスタ照合に実際の距離計算をさせる */
const AMMO_CELLS: readonly PixelRegion[] = [0, 1, 2, 3].map((variant) =>
  region(AMMO_CELL.width, AMMO_CELL.height, (x, y) =>
    (x + y + variant * 3) % 5 === 0 ? 240 : 10,
  ),
);
const CHARGE_ON = region(CHARGE_REGION.width, CHARGE_REGION.height, () => 200);
const CHARGE_OFF = region(CHARGE_REGION.width, CHARGE_REGION.height, () => 30);
const BOOST_LEVELS: readonly PixelRegion[] = [1, 0.8, 0.6, 0.4].map((fill) =>
  region(BOOST_REGION.width, BOOST_REGION.height, (x) =>
    x < fill * BOOST_REGION.width ? 255 : 0,
  ),
);

function slotIdOf(index: number): string {
  return `slot-${index}`;
}

function regionsAt(frameIndex: number): SampledRegions {
  return {
    slots: Array.from({ length: SLOT_COUNT }, (_, slot) => ({
      slotId: slotIdOf(slot),
      ammoCells: Array.from(
        { length: DIGITS_PER_SLOT },
        (_, digit) => AMMO_CELLS[(frameIndex + slot + digit) % AMMO_CELLS.length],
      ),
      charge: frameIndex % 120 < 60 ? CHARGE_ON : CHARGE_OFF,
      buttonIndicator: null,
    })),
    boost: BOOST_LEVELS[Math.floor(frameIndex / 90) % BOOST_LEVELS.length],
  };
}

const VIDEO_KEY: VideoKey = {
  fileName: 'bench.mp4',
  durationMs: FRAME_COUNT * FRAME_MS,
  width: 1920,
  height: 1080,
};

function calibration(): HudCalibration {
  const slots: WeaponSlotCalibration[] = Array.from({ length: SLOT_COUNT }, (_, index) => ({
    id: slotIdOf(index),
    index,
    inputType: 'shot',
    inputTypeSource: 'auto',
    ammoRect: { x: 0.1 + index * 0.05, y: 0.9, width: 0.03, height: 0.03 },
    digitCount: DIGITS_PER_SLOT,
    buttonIndicatorRect: null,
    chargeRect: { x: 0.1 + index * 0.05, y: 0.95, width: 0.03, height: 0.02 },
    chargeKind: 'shot',
  }));
  return {
    videoKey: VIDEO_KEY,
    createdAt: '2026-09-15T00:00:00.000Z',
    slots,
    boostRect: { x: 0.1, y: 0.85, width: 0.3, height: 0.02 },
    glyphBank: EMPTY_BANK,
  };
}

/** 走査 1 本ぶんを観測値へ還元し、チャンクごとの所要時間も測る */
function observeAll(): {
  readonly timeline: SampleTimeline;
  readonly totalMs: number;
  readonly worstChunkMs: number;
} {
  const samples: FrameSample[] = [];
  let bank: GlyphBank = EMPTY_BANK;
  let worstChunkMs = 0;
  let chunkStart = performance.now();
  const startedAt = chunkStart;

  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const reduced = reduceFrame(
      index * FRAME_MS,
      regionsAt(index),
      bank,
      DEFAULT_ANALYSIS_PARAMS,
    );
    bank = reduced.bank;
    samples.push(reduced.sample);

    // 本番はこの間隔でメインスレッドを手放す。1 区間が長タスクの単位になる
    if ((index + 1) % SCAN_YIELD_INTERVAL_FRAMES === 0) {
      const now = performance.now();
      worstChunkMs = Math.max(worstChunkMs, now - chunkStart);
      chunkStart = now;
    }
  }

  return {
    timeline: {
      videoKey: VIDEO_KEY,
      frameDurationMs: FRAME_MS,
      samples,
      gaps: [],
      glyphBank: bank,
      truncated: false,
    },
    totalMs: performance.now() - startedAt,
    worstChunkMs,
  };
}

/** 数字ラベルを機械的に与える。検出器に実際の増減を見せるため */
function labelAll(bank: GlyphBank): GlyphBank {
  return {
    templates: bank.templates.map((template, index) => ({
      ...template,
      digit: index % 10,
    })),
  };
}

describe('解析の性能', () => {
  const observed = observeAll();
  const target = calibration();
  const labeled: SampleTimeline = { ...observed.timeline, glyphBank: labelAll(observed.timeline.glyphBank) };

  it('60 秒ぶんの観測が、走査の持ち時間に対して十分に小さい', () => {
    // 走査全体の目標は 3 分（Req 5.5）。観測がその 1 割を超えるなら
    // デコードに回せる余地がなくなるので、ここで気づけるようにする
    const budgetMs = 3 * 60 * 1000 * 0.1;
    console.log(
      `[perf] 観測 1800 フレーム: ${observed.totalMs.toFixed(1)}ms ` +
        `(1 フレームあたり ${(observed.totalMs / FRAME_COUNT).toFixed(3)}ms)`,
    );
    expect(observed.totalMs).toBeLessThan(budgetMs);
  });

  it('メインスレッドを手放すまでの 1 区間が長タスクにならない', () => {
    console.log(
      `[perf] 最長区間（${SCAN_YIELD_INTERVAL_FRAMES} フレーム）: ` +
        `${observed.worstChunkMs.toFixed(1)}ms`,
    );
    expect(observed.worstChunkMs).toBeLessThan(LONG_TASK_BUDGET_MS);
  });

  it('観測はスロット数ぶんのサンプルを取りこぼさない', () => {
    expect(observed.timeline.samples).toHaveLength(FRAME_COUNT);
    const slots: readonly SlotSample[] = observed.timeline.samples[0].slots;
    expect(slots).toHaveLength(SLOT_COUNT);
  });

  it('検出の再実行が 500 ミリ秒以内に終わる', () => {
    const startedAt = performance.now();
    const result = runDetectors(labeled, target, DEFAULT_ANALYSIS_PARAMS);
    const elapsedMs = performance.now() - startedAt;

    console.log(
      `[perf] 検出の再実行: ${elapsedMs.toFixed(1)}ms（${result.steps.length} 件）`,
    );
    expect(elapsedMs).toBeLessThan(RERUN_BUDGET_MS);
  });

  it('閾値を変えた再実行も同じ持ち時間に収まる', () => {
    const startedAt = performance.now();
    runDetectors(labeled, target, {
      ...DEFAULT_ANALYSIS_PARAMS,
      boostDropThreshold: 0.02,
      sustainedFireGapMs: 50,
    });
    const elapsedMs = performance.now() - startedAt;

    console.log(`[perf] 閾値変更後の再実行: ${elapsedMs.toFixed(1)}ms`);
    expect(elapsedMs).toBeLessThan(RERUN_BUDGET_MS);
  });
});
