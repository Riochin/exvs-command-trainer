import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCalibrationStore } from '@/features/chart-author/calibration/useCalibrationStore';
import { CALIBRATION_STORAGE_KEY } from '@/features/chart-author/constants';
import type { StorageResult } from '@/types';
import type { GlyphBank, HudCalibration, VideoKey } from '@/features/chart-author/types';

const VIDEO_KEY: VideoKey = {
  fileName: 'clip.mp4',
  durationMs: 60_000,
  width: 1920,
  height: 1080,
};

const RECT = { x: 0.1, y: 0.9, width: 0.05, height: 0.03 };

const BANK: GlyphBank = {
  templates: [
    {
      key: 'g1',
      descriptor: { features: [0.5], inkRatio: 0.5 },
      digit: 3,
      previewDataUrl: 'data:image/png;base64,AAA',
    },
  ],
};

function stored(): Record<string, HudCalibration> {
  const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, HudCalibration>);
}

/** 解析を始められる校正まで組み立てる */
function setUp() {
  const view = renderHook(() => useCalibrationStore(VIDEO_KEY));
  act(() => void view.result.current.addSlot(RECT));
  act(() => view.result.current.setBoostRect(RECT));
  return view;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useCalibrationStore - saveGlyphBank', () => {
  it('グリフ束を校正へ載せる', () => {
    const { result } = setUp();

    act(() => void result.current.saveGlyphBank(BANK));

    expect(result.current.calibration?.glyphBank).toEqual(BANK);
  });

  it('載せた内容をそのまま保存する', () => {
    const { result } = setUp();

    act(() => void result.current.saveGlyphBank(BANK));

    expect(stored()[VIDEO_KEY.fileName].glyphBank.templates[0].digit).toBe(3);
  });

  it('矩形は保ったままにする', () => {
    const { result } = setUp();

    act(() => void result.current.saveGlyphBank(BANK));

    expect(stored()[VIDEO_KEY.fileName].slots).toHaveLength(1);
    expect(stored()[VIDEO_KEY.fileName].boostRect.width).toBeCloseTo(RECT.width, 5);
  });

  it('保存できた校正を結果として返す', () => {
    const { result } = setUp();

    let outcome!: StorageResult<HudCalibration>;
    act(() => {
      outcome = result.current.saveGlyphBank(BANK);
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.glyphBank).toEqual(BANK);
  });

  it('校正が無ければ保存せず理由を返す', () => {
    const { result } = renderHook(() => useCalibrationStore(null));

    let outcome!: StorageResult<HudCalibration>;
    act(() => {
      outcome = result.current.saveGlyphBank(BANK);
    });

    expect(outcome.ok).toBe(false);
    expect(stored()).toEqual({});
  });
});
