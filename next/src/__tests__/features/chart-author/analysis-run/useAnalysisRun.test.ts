import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnalysisRun } from '@/features/chart-author/analysis-run/useAnalysisRun';
import { exceedsScanDuration } from '@/features/chart-author/analysis-run/useAnalysisRun';
import {
  DEFAULT_ANALYSIS_PARAMS,
  MAX_SCAN_DURATION_MS,
  SCAN_YIELD_INTERVAL_FRAMES,
} from '@/features/chart-author/constants';
import type { HudCalibration } from '@/features/chart-author/types';
import { calibrationOf, slot, VIDEO_KEY } from '../analysis/helpers';
import {
  createFakeSampler,
  createManualFrameSource,
  tick,
  type FrameLook,
  type ManualFrameSource,
} from './fakeScan';

const FRAME_MS = 100;

const CALIBRATION = calibrationOf([slot()]);

type Harness = {
  readonly frameSource: ManualFrameSource;
  readonly sampler: ReturnType<typeof createFakeSampler>;
  readonly yieldToMain: ReturnType<typeof vi.fn>;
  readonly openFrameSource: ReturnType<typeof vi.fn>;
};

let harness: Harness;
let clock = 0;

function setUp(
  options: {
    look?: (index: number) => FrameLook;
    durationMs?: number;
    openResult?: { ok: false; reason: 'decode_failed' | 'metadata_timeout' };
  } = {},
) {
  const frameSource = createManualFrameSource({
    durationMs: options.durationMs ?? 1000,
    frameDurationMs: FRAME_MS,
  });
  const sampler = createFakeSampler(options.look);
  const yieldToMain = vi.fn(async () => {});
  const openFrameSource = vi.fn(async () =>
    options.openResult ?? { ok: true as const, source: frameSource.source },
  );

  harness = { frameSource, sampler, yieldToMain, openFrameSource };

  return renderHook(() =>
    useAnalysisRun({
      openFrameSource,
      createSampler: () => sampler,
      now: () => clock,
      yieldToMain,
    }),
  );
}

/** 走査を開始し、供給が始まるところまで進める */
async function startScan(
  result: { current: ReturnType<typeof useAnalysisRun> },
  calibration: HudCalibration = CALIBRATION,
): Promise<void> {
  await act(async () => {
    void result.current.start('blob:mock-1', calibration);
    await tick();
  });
}

beforeEach(() => {
  clock = 0;
});

describe('useAnalysisRun - 走査の開始条件', () => {
  it('校正が検証を通らなければ走査せず、不足項目を添えて失敗する', async () => {
    const { result } = setUp();
    const broken: HudCalibration = { ...CALIBRATION, slots: [] };

    await startScan(result, broken);

    expect(result.current.phase).toBe('failed');
    expect(result.current.failure).toEqual({
      kind: 'calibration_invalid',
      defects: [{ kind: 'no_weapon_slot' }],
    });
    expect(harness.openFrameSource).not.toHaveBeenCalled();
  });

  it('フレーム供給を開けなければ理由つきで失敗する', async () => {
    const { result } = setUp({ openResult: { ok: false, reason: 'decode_failed' } });

    await startScan(result);

    expect(result.current.phase).toBe('failed');
    expect(result.current.failure).toEqual({
      kind: 'frame_source_unavailable',
      reason: 'decode_failed',
    });
  });

  it('走査可能な最大尺を超える動画では走査開始前に警告する', async () => {
    const longVideo: HudCalibration = {
      ...CALIBRATION,
      videoKey: { ...VIDEO_KEY, durationMs: MAX_SCAN_DURATION_MS + 1 },
    };
    const { result } = setUp({ durationMs: MAX_SCAN_DURATION_MS + 1 });

    await startScan(result, longVideo);

    expect(result.current.warning).toEqual({
      kind: 'duration_exceeds_max',
      durationMs: MAX_SCAN_DURATION_MS + 1,
      maxMs: MAX_SCAN_DURATION_MS,
    });
    // 警告は止めるためではなく知らせるためのもの。走査自体は始まる
    expect(result.current.phase).toBe('scanning');
  });

  it('最大尺を超えるかどうかは走査を始める前に判定できる', () => {
    expect(exceedsScanDuration(MAX_SCAN_DURATION_MS)).toBe(false);
    expect(exceedsScanDuration(MAX_SCAN_DURATION_MS + 1)).toBe(true);
  });
});

describe('useAnalysisRun - 走査', () => {
  it('動画の先頭から順にフレームを観測値へ還元する', async () => {
    const { result } = setUp({
      look: (index) => ({ boostFill: index === 2 ? 0.5 : 1 }),
    });
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliverMany(4, FRAME_MS);
      await harness.frameSource.finish();
    });

    const timeline = result.current.timeline;
    expect(timeline?.samples.map((s) => s.tMs)).toEqual([0, 100, 200, 300]);
    expect(timeline?.samples[2].boostFill).toBeCloseTo(0.5, 2);
    expect(timeline?.frameDurationMs).toBe(FRAME_MS);
    expect(timeline?.truncated).toBe(false);
  });

  it('校正された領域だけを対象にフレームごとに画素を取り出す', async () => {
    const { result } = setUp();
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliverMany(3, FRAME_MS);
      await harness.frameSource.finish();
    });

    expect(harness.sampler.calls).toHaveLength(3);
    expect(harness.sampler.calls[0].calibration).toBe(CALIBRATION);
  });

  it('CHARGE の点灯と閾値からの余裕を観測値に持たせる', async () => {
    const charged = calibrationOf([
      slot({ chargeRect: { x: 0.1, y: 0.1, width: 0.05, height: 0.05 }, chargeKind: 'shot' }),
    ]);
    const { result } = setUp({
      look: (index) => ({ chargeValue: index === 0 ? 0 : 255 }),
    });
    await startScan(result, charged);

    await act(async () => {
      await harness.frameSource.deliverMany(2, FRAME_MS);
      await harness.frameSource.finish();
    });

    const samples = result.current.timeline?.samples ?? [];
    expect(samples[0].slots[0].chargeOn).toBe(false);
    expect(samples[1].slots[0].chargeOn).toBe(true);
    expect(samples[1].slots[0].chargeMargin).toBeGreaterThan(0.9);
  });

  it('桁セルをクラスタへまとめながら走査する', async () => {
    const { result } = setUp({ look: () => ({ inked: true }) });
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliverMany(3, FRAME_MS);
      await harness.frameSource.finish();
    });

    const timeline = result.current.timeline;
    // 見た目が同じ桁は 1 つのクラスタへまとまる
    expect(timeline?.glyphBank.templates).toHaveLength(1);
    expect(timeline?.samples[0].slots[0].digits).toHaveLength(2);
  });

  it('走査を終えたらフレーム供給と画素取り出しを手放す', async () => {
    const { result } = setUp();
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliver(0);
      await harness.frameSource.finish();
    });

    expect(harness.frameSource.isDisposed()).toBe(true);
    expect(harness.sampler.isDisposed()).toBe(true);
    expect(result.current.phase).toBe('done');
  });
});

describe('useAnalysisRun - 進捗', () => {
  it('処理済みの割合をフレーム時刻から算出する', async () => {
    const { result } = setUp({ durationMs: 1000 });
    await startScan(result);
    expect(result.current.progress.ratio).toBe(0);

    await act(async () => {
      await harness.frameSource.deliver(500);
    });
    expect(result.current.progress.ratio).toBeCloseTo(0.5, 5);
    expect(result.current.progress.processedFrames).toBe(1);

    await act(async () => {
      await harness.frameSource.deliver(900);
      await harness.frameSource.finish();
    });
    // 走り切ったら取りこぼしの有無に依らず 1 に達する
    expect(result.current.progress.ratio).toBe(1);
  });

  it('フレームを取りこぼしても進捗が後戻りしない', async () => {
    const { result } = setUp({ durationMs: 1000 });
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliver(200);
      await harness.frameSource.deliver(600, 3);
    });

    expect(result.current.progress.ratio).toBeCloseTo(0.6, 5);
    expect(result.current.progress.processedFrames).toBe(2);
  });

  it('経過時間を報告する', async () => {
    const { result } = setUp();
    clock = 1000;
    await startScan(result);

    clock = 3500;
    await act(async () => {
      await harness.frameSource.deliver(100);
    });

    expect(result.current.progress.elapsedMs).toBe(2500);
  });

  it('一定枚数ごとにメインスレッドを解放する', async () => {
    const { result } = setUp();
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliverMany(SCAN_YIELD_INTERVAL_FRAMES, FRAME_MS);
    });
    expect(harness.yieldToMain).toHaveBeenCalledTimes(1);

    await act(async () => {
      await harness.frameSource.deliverMany(SCAN_YIELD_INTERVAL_FRAMES, FRAME_MS);
      await harness.frameSource.finish();
    });
    expect(harness.yieldToMain).toHaveBeenCalledTimes(2);
  });
});

describe('useAnalysisRun - 欠測とキャンセル', () => {
  it('フレームの取りこぼしが起きた区間を欠測として記録する', async () => {
    const { result } = setUp();
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliver(0);
      await harness.frameSource.deliver(100);
      await harness.frameSource.deliver(500, 3);
      await harness.frameSource.deliver(600);
      await harness.frameSource.finish();
    });

    expect(result.current.timeline?.gaps).toEqual([[100, 500]]);
  });

  it('走査中のキャンセルで、そこまでの観測結果を打ち切り済みとして残す', async () => {
    const { result } = setUp();
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliver(0);
      await harness.frameSource.deliver(100);
    });

    await act(async () => {
      result.current.cancel();
      await tick();
    });

    expect(result.current.timeline?.samples.map((s) => s.tMs)).toEqual([0, 100]);
    expect(result.current.timeline?.truncated).toBe(true);
    expect(result.current.phase).toBe('done');
    expect(harness.frameSource.isDisposed()).toBe(true);
  });

  it('キャンセル後の進捗は 1 まで進めない', async () => {
    const { result } = setUp({ durationMs: 1000 });
    await startScan(result);

    await act(async () => {
      await harness.frameSource.deliver(200);
    });
    await act(async () => {
      result.current.cancel();
      await tick();
    });

    expect(result.current.progress.ratio).toBeCloseTo(0.2, 5);
  });

  it('走査を始め直すと、進行中の走査を中断してから始める', async () => {
    const { result } = setUp();
    await startScan(result);
    await act(async () => {
      await harness.frameSource.deliver(0);
    });

    const first = harness.frameSource;
    await startScan(result);

    expect(first.isDisposed()).toBe(true);
    expect(result.current.timeline).toBeNull();
    expect(result.current.progress.processedFrames).toBe(0);
  });

  it('やり直しの操作で走査結果を捨てる', async () => {
    const { result } = setUp();
    await startScan(result);
    await act(async () => {
      await harness.frameSource.deliver(0);
      await harness.frameSource.finish();
    });

    act(() => result.current.reset());

    expect(result.current.phase).toBe('idle');
    expect(result.current.timeline).toBeNull();
    expect(result.current.params).toEqual(DEFAULT_ANALYSIS_PARAMS);
  });
});
