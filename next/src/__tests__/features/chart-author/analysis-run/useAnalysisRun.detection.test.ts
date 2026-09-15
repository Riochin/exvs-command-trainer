import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnalysisRun } from '@/features/chart-author/analysis-run/useAnalysisRun';
import { useCalibrationStore } from '@/features/chart-author/calibration/useCalibrationStore';
import {
  CALIBRATION_STORAGE_KEY,
  DEFAULT_ANALYSIS_PARAMS,
} from '@/features/chart-author/constants';
import type { HudCalibration, VideoKey } from '@/features/chart-author/types';
import { calibrationOf, slot } from '../analysis/helpers';
import {
  createFakeSampler,
  createManualFrameSource,
  tick,
  type FrameLook,
  type ManualFrameSource,
} from './fakeScan';

const FRAME_MS = 100;

type Harness = {
  readonly frameSource: ManualFrameSource;
  readonly openFrameSource: ReturnType<typeof vi.fn>;
};

let harness: Harness;

function setUp(look?: (index: number) => FrameLook) {
  const frameSource = createManualFrameSource({
    durationMs: 1000,
    frameDurationMs: FRAME_MS,
  });
  const openFrameSource = vi.fn(async () => ({ ok: true as const, source: frameSource.source }));
  harness = { frameSource, openFrameSource };

  return renderHook(() =>
    useAnalysisRun({
      openFrameSource,
      createSampler: () => createFakeSampler(look),
      now: () => 0,
      yieldToMain: async () => {},
    }),
  );
}

/** 走査を最後まで回し、観測列が揃った状態にする */
async function scan(
  result: { current: ReturnType<typeof useAnalysisRun> },
  calibration: HudCalibration,
  frames: number,
): Promise<void> {
  await act(async () => {
    void result.current.start('blob:mock-1', calibration);
    await tick();
  });
  await act(async () => {
    await harness.frameSource.deliverMany(frames, FRAME_MS);
    await harness.frameSource.finish();
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useAnalysisRun - 未解決グリフ', () => {
  it('数字ラベルが未付与のクラスタを一覧として返す', async () => {
    const { result } = setUp(() => ({ inked: true }));

    await scan(result, calibrationOf([slot()]), 3);

    expect(result.current.unresolvedGlyphs).toHaveLength(1);
    expect(result.current.unresolvedGlyphs[0].digit).toBeNull();
    expect(result.current.phase).toBe('resolving');
  });

  it('未解決のクラスタが無ければ解決の段階を飛ばす', async () => {
    const { result } = setUp();

    await scan(result, calibrationOf([slot()]), 3);

    expect(result.current.unresolvedGlyphs).toHaveLength(0);
    expect(result.current.phase).toBe('done');
  });

  it('ラベルを与えると未解決から外れ、解決済みになったら段階が進む', async () => {
    const { result } = setUp(() => ({ inked: true }));
    await scan(result, calibrationOf([slot()]), 3);
    const key = result.current.unresolvedGlyphs[0].key;

    act(() => result.current.labelGlyph(key, 7));

    expect(result.current.unresolvedGlyphs).toHaveLength(0);
    expect(result.current.glyphBank.templates[0].digit).toBe(7);
    expect(result.current.phase).toBe('done');
  });

  it('ラベル付けでは動画を開き直さない', async () => {
    const { result } = setUp(() => ({ inked: true }));
    await scan(result, calibrationOf([slot()]), 3);
    const key = result.current.unresolvedGlyphs[0].key;

    act(() => result.current.labelGlyph(key, 7));

    expect(harness.openFrameSource).toHaveBeenCalledTimes(1);
  });

  it('走査していない状態でのラベル付けは何も起こさない', () => {
    const { result } = setUp();

    act(() => result.current.labelGlyph('g1', 3));

    expect(result.current.timeline).toBeNull();
  });
});

describe('useAnalysisRun - 検出', () => {
  /** 2 フレーム目でブーストが急減する見え方 */
  const boostDrop = (index: number): FrameLook => ({ boostFill: index === 0 ? 1 : 0.5 });

  it('走査が終わるとステップと種別ごとの件数が得られる', async () => {
    const { result } = setUp(boostDrop);

    await scan(result, calibrationOf([slot()]), 3);

    expect(result.current.steps.length).toBeGreaterThan(0);
    expect(result.current.summary?.total).toBe(result.current.steps.length);
    expect(result.current.summary?.countsByInput.bd).toBeGreaterThan(0);
  });

  it('走査していなければステップも件数も持たない', () => {
    const { result } = setUp();

    expect(result.current.steps).toHaveLength(0);
    expect(result.current.summary).toBeNull();
  });

  it('パラメータを変えると検出だけが走り直す', async () => {
    const { result } = setUp(boostDrop);
    await scan(result, calibrationOf([slot()]), 3);
    const before = result.current.steps.length;

    act(() =>
      result.current.setParams({ ...DEFAULT_ANALYSIS_PARAMS, boostDropThreshold: 0.9 }),
    );

    // 閾値を上げれば急減とはみなされなくなる
    expect(result.current.steps.length).toBeLessThan(before);
    expect(result.current.params.boostDropThreshold).toBe(0.9);
    expect(harness.openFrameSource).toHaveBeenCalledTimes(1);
    expect(result.current.timeline?.samples).toHaveLength(3);
  });

  it('ラベルを与えるたびに検出結果が更新される', async () => {
    // 桁の見え方が 1 フレーム目で変わる。数字が決まるまで増減の向きが分からない
    const { result } = setUp((index) => ({ ink: index === 0 ? 'top' : 'bottom' }));
    await scan(result, calibrationOf([slot({ digitCount: 1 })]), 3);

    expect(result.current.steps.map((step) => step.caveat)).toContain('direction_unknown');
    expect(result.current.unresolvedGlyphs).toHaveLength(2);

    const [first, second] = result.current.unresolvedGlyphs;
    act(() => result.current.labelGlyph(first.key, 2));
    // 1 件目のラベルだけでは値が揃わず、まだ向きは決まらない
    expect(result.current.steps.map((step) => step.caveat)).toContain('direction_unknown');

    act(() => result.current.labelGlyph(second.key, 1));

    // 2 → 1 の減少として読めるようになり、要確認の印が外れる
    const ammo = result.current.steps.filter((step) => step.detector === 'ammo');
    expect(ammo).toHaveLength(1);
    expect(ammo[0].caveat).toBe('none');
    expect(ammo[0].input).toBe('shot');
    expect(harness.openFrameSource).toHaveBeenCalledTimes(1);
  });
});

describe('解決済みグリフの再利用', () => {
  const VIDEO: VideoKey = {
    fileName: 'clip.mp4',
    durationMs: 60_000,
    width: 1920,
    height: 1080,
  };

  it('校正に載せたグリフの束を走査の出発点にする', async () => {
    const { result } = setUp(() => ({ inked: true }));

    // 1 本目でクラスタを作り、ラベルを与える
    await scan(result, calibrationOf([slot()]), 2);
    const key = result.current.unresolvedGlyphs[0].key;
    act(() => result.current.labelGlyph(key, 4));
    const resolvedBank = result.current.glyphBank;

    // 解決済みの束を載せた校正で走り直すと、未解決は増えない
    const reused = { ...calibrationOf([slot()]), glyphBank: resolvedBank };
    const second = setUp(() => ({ inked: true }));
    await scan(second.result, reused, 2);

    expect(second.result.current.unresolvedGlyphs).toHaveLength(0);
    expect(second.result.current.phase).toBe('done');
  });

  it('解決済みの束を校正として保存できる', () => {
    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    act(() => {
      result.current.addSlot({ x: 0.8, y: 0.2, width: 0.06, height: 0.04 });
      result.current.setBoostRect({ x: 0.3, y: 0.9, width: 0.4, height: 0.02 });
      result.current.setGlyphBank({
        templates: [
          {
            key: 'g1',
            descriptor: { features: [0.5], inkRatio: 0.5 },
            digit: 4,
            previewDataUrl: null,
          },
        ],
      });
    });
    act(() => void result.current.persist());

    const stored = JSON.parse(
      window.localStorage.getItem(CALIBRATION_STORAGE_KEY) ?? '{}',
    ) as Record<string, HudCalibration>;
    expect(stored['clip.mp4'].glyphBank.templates[0].digit).toBe(4);
  });
});
