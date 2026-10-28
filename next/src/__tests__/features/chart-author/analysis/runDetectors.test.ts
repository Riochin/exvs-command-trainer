import { describe, it, expect } from 'vitest';
import { runDetectors } from '@/features/chart-author/analysis/runDetectors';
import { DEFAULT_ANALYSIS_PARAMS, EMPTY_GLYPH } from '@/features/chart-author/constants';
import type {
  AnalysisParams,
  GlyphBank,
  GlyphKey,
  SampleTimeline,
} from '@/features/chart-author/types';
import { FRAME_MS, at, calibrationOf, frame, slot, slotSample, timelineOf } from './helpers';

const PARAMS: AnalysisParams = {
  ...DEFAULT_ANALYSIS_PARAMS,
  chargeMinOnFrames: 2,
  boostDropWindowMs: FRAME_MS,
};

const DIGIT_BANK: GlyphBank = {
  templates: Array.from({ length: 10 }, (_v, digit) => ({
    key: `d${digit}`,
    descriptor: { features: [digit / 10], inkRatio: 0.3 },
    digit,
    previewDataUrl: null,
  })),
};

const CHARGE_RECT = { x: 0.2, y: 0.2, width: 0.05, height: 0.05 };

const CALIBRATION = calibrationOf(
  [slot({ inputType: 'sub', chargeRect: CHARGE_RECT, chargeKind: 'shot' })],
  DIGIT_BANK,
);

function digitsOf(value: number): GlyphKey[] {
  const cells = [...String(value)].map((c) => `d${c}`);
  while (cells.length < 2) cells.push(EMPTY_GLYPH);
  return cells;
}

/**
 * 3 種の検出が別々の時点で起きる観測列。
 * 弾数は f6、CHARGE は f2 点灯・f4 消灯、ブーストは f8 で急減する。
 */
function mixedTimeline(): SampleTimeline {
  const ammo = [9, 9, 9, 9, 9, 9, 8, 8, 8, 8];
  const charge = '0011000000';
  const boost = [1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.5];
  const samples = ammo.map((value, i) =>
    frame(
      i,
      [slotSample({ digits: digitsOf(value), chargeOn: charge[i] === '1' })],
      boost[i],
    ),
  );
  return timelineOf(samples, { glyphBank: DIGIT_BANK });
}

describe('runDetectors', () => {
  it('3 種の検出結果を時刻の昇順に統合する', () => {
    const { steps } = runDetectors(mixedTimeline(), CALIBRATION, PARAMS);
    expect(steps.map((s) => [s.tMs, s.input, s.detector])).toEqual([
      [at(2), 'shot-charge-start', 'charge'],
      [at(4), 'shot-charge-end', 'charge'],
      [at(6), 'sub', 'ammo'],
      [at(7), 'bd', 'boost'],
    ]);
  });

  it('すべてのステップが 0..1 の信頼度を持つ', () => {
    const { steps } = runDetectors(mixedTimeline(), CALIBRATION, PARAMS);
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step.confidence).toBeGreaterThanOrEqual(0);
      expect(step.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('格闘入力を一切出力しない', () => {
    const { steps } = runDetectors(mixedTimeline(), CALIBRATION, PARAMS);
    expect(steps.some((s) => s.input === 'melee')).toBe(false);
  });

  it('入力種別ごとの件数と総数を集計する', () => {
    const { summary } = runDetectors(mixedTimeline(), CALIBRATION, PARAMS);
    expect(summary.countsByInput).toEqual({
      'shot-charge-start': 1,
      'shot-charge-end': 1,
      sub: 1,
      bd: 1,
    });
    expect(summary.total).toBe(4);
  });

  it('集計の総数はステップ数に一致する', () => {
    const { steps, summary } = runDetectors(mixedTimeline(), CALIBRATION, PARAMS);
    expect(summary.total).toBe(steps.length);
    const counted = Object.values(summary.countsByInput).reduce((a, b) => a + b, 0);
    expect(counted).toBe(steps.length);
  });

  it('同じ入力に対して常に同じ結果を返す', () => {
    const first = runDetectors(mixedTimeline(), CALIBRATION, PARAMS);
    const second = runDetectors(mixedTimeline(), CALIBRATION, PARAMS);
    expect(second).toEqual(first);
  });

  it('検出が無い観測列では空のステップと総数 0 を返す', () => {
    const flat = timelineOf(
      [0, 1, 2].map((i) => frame(i, [slotSample({ digits: digitsOf(9) })], 1)),
      { glyphBank: DIGIT_BANK },
    );
    const { steps, summary } = runDetectors(flat, CALIBRATION, PARAMS);
    expect(steps).toEqual([]);
    expect(summary).toEqual({ countsByInput: {}, total: 0 });
  });

  it('同じ時刻に複数の検出が並んでも昇順は崩れない', () => {
    const samples = [
      frame(0, [slotSample({ digits: digitsOf(9), chargeOn: false })], 1),
      frame(1, [slotSample({ digits: digitsOf(9), chargeOn: true })], 1),
      frame(2, [slotSample({ digits: digitsOf(8), chargeOn: true })], 0.5),
    ];
    const { steps } = runDetectors(
      timelineOf(samples, { glyphBank: DIGIT_BANK }),
      CALIBRATION,
      PARAMS,
    );
    const times = steps.map((s) => s.tMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.length).toBeGreaterThan(1);
  });
});
