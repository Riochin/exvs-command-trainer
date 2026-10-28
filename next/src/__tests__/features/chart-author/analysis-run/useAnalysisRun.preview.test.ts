import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnalysisRun } from '@/features/chart-author/analysis-run/useAnalysisRun';
import type { PixelRegion } from '@/features/chart-author/types';
import { calibrationOf, slot } from '../analysis/helpers';
import {
  createFakeSampler,
  createManualFrameSource,
  tick,
  type FrameLook,
  type ManualFrameSource,
} from './fakeScan';

const FRAME_MS = 100;
const CALIBRATION = calibrationOf([slot()]);

/** 途中で見え方が変わる = クラスタが 2 つできる */
const twoClusters = (index: number): FrameLook => ({ ink: index < 3 ? 'top' : 'bottom' });

let frameSource: ManualFrameSource;
let renderGlyphPreview: ReturnType<typeof vi.fn>;

beforeEach(() => {
  renderGlyphPreview = vi.fn((region: PixelRegion) => `data:image/png;base64,${region.width}`);
});

function setUp(look: (index: number) => FrameLook = twoClusters) {
  frameSource = createManualFrameSource({ durationMs: 1000, frameDurationMs: FRAME_MS });
  return renderHook(() =>
    useAnalysisRun({
      openFrameSource: async () => ({ ok: true as const, source: frameSource.source }),
      createSampler: () => createFakeSampler(look),
      yieldToMain: async () => {},
      renderGlyphPreview,
    }),
  );
}

async function scan(
  result: { current: ReturnType<typeof useAnalysisRun> },
  frames = 6,
): Promise<void> {
  await act(async () => {
    void result.current.start('blob:mock-1', CALIBRATION);
    await tick();
  });
  await act(async () => {
    await frameSource.deliverMany(frames, FRAME_MS);
    await frameSource.finish();
  });
}

describe('useAnalysisRun - 未解決グリフの切り出し画像', () => {
  it('未解決のクラスタに切り出し画像が載る', async () => {
    const { result } = setUp();

    await scan(result);

    expect(result.current.unresolvedGlyphs.length).toBeGreaterThan(0);
    for (const glyph of result.current.unresolvedGlyphs) {
      expect(glyph.previewDataUrl).not.toBeNull();
    }
  });

  it('画像を作るのはクラスタができた瞬間だけで、毎フレームではない', async () => {
    const { result } = setUp();

    await scan(result, 6);

    // 6 フレーム × 2 桁ぶん呼ばれてはいけない。クラスタは 2 つ
    expect(result.current.unresolvedGlyphs).toHaveLength(2);
    expect(renderGlyphPreview).toHaveBeenCalledTimes(2);
  });

  it('画像は元の桁セルの画素から作る', async () => {
    const { result } = setUp();

    await scan(result);

    const region = renderGlyphPreview.mock.calls[0][0] as PixelRegion;
    expect(region.width).toBeGreaterThan(0);
    expect(region.data.length).toBe(region.width * region.height * 4);
  });

  it('数字を与えても画像は保たれる', async () => {
    const { result } = setUp();
    await scan(result);
    const target = result.current.unresolvedGlyphs[0];

    act(() => result.current.labelGlyph(target.key, 4));

    const labeled = result.current.glyphBank.templates.find(
      (template) => template.key === target.key,
    );
    expect(labeled?.digit).toBe(4);
    expect(labeled?.previewDataUrl).toBe(target.previewDataUrl);
  });

  it('画像を作れない環境でも走査は完走する', async () => {
    renderGlyphPreview.mockReturnValue(null);
    const { result } = setUp();

    await scan(result);

    expect(result.current.phase).toBe('resolving');
    expect(result.current.unresolvedGlyphs).toHaveLength(2);
    expect(result.current.unresolvedGlyphs[0].previewDataUrl).toBeNull();
  });
});
