import { describe, it, expect } from 'vitest';
import { detectAmmoSteps } from '@/features/chart-author/analysis/ammoDetector';
import { EMPTY_BANK } from '@/features/chart-author/analysis/glyphBank';
import {
  ACROSS_GAP_CONFIDENCE_FACTOR,
  DEFAULT_ANALYSIS_PARAMS,
  DETECTION_CONFIDENCE,
  EMPTY_GLYPH,
} from '@/features/chart-author/constants';
import type {
  AnalysisParams,
  GlyphBank,
  GlyphDescriptor,
  GlyphKey,
  SampleTimeline,
} from '@/features/chart-author/types';
import { FRAME_MS, at, calibrationOf, frame, slot, slotSample, timelineOf } from './helpers';

const PARAMS: AnalysisParams = { ...DEFAULT_ANALYSIS_PARAMS, sustainedFireGapMs: 150 };

const CALIBRATION = calibrationOf([slot({ inputType: 'sub', digitCount: 2 })]);

/** 数字 0..9 をラベル済みにした bank。キーは `d0`..`d9` */
const DIGIT_BANK: GlyphBank = {
  templates: Array.from({ length: 10 }, (_v, digit) => ({
    key: `d${digit}`,
    descriptor: { features: [digit / 10], inkRatio: 0.3 } as GlyphDescriptor,
    digit,
    previewDataUrl: null,
  })),
};

/** 未ラベルのクラスタを 1 つ足した bank */
const BANK_WITH_UNKNOWN: GlyphBank = {
  templates: [
    ...DIGIT_BANK.templates,
    { key: 'u1', descriptor: { features: [9.9], inkRatio: 0.3 }, digit: null, previewDataUrl: null },
    { key: 'u2', descriptor: { features: [9.8], inkRatio: 0.3 }, digit: null, previewDataUrl: null },
  ],
};

/** 2 桁の弾数表示を桁セル列にする。左詰めで余りは空セル */
function digitsOf(value: number): GlyphKey[] {
  const text = String(value);
  const cells = [...text].map((c) => `d${c}`);
  while (cells.length < 2) cells.push(EMPTY_GLYPH);
  return cells;
}

/** 弾数の並びを観測列にする。要素が配列ならそのまま桁セル列として使う */
function ammoTimeline(
  values: readonly (number | GlyphKey[])[],
  opts: {
    bank?: GlyphBank;
    gaps?: readonly (readonly [number, number])[];
    frameIndexOf?: (i: number) => number;
  } = {},
): SampleTimeline {
  const samples = values.map((v, i) =>
    frame(opts.frameIndexOf?.(i) ?? i, [
      slotSample({ digits: Array.isArray(v) ? v : digitsOf(v) }),
    ]),
  );
  return timelineOf(samples, { gaps: opts.gaps, glyphBank: opts.bank ?? DIGIT_BANK });
}

describe('detectAmmoSteps', () => {
  it('弾数が減少した時点にスロットの入力種別のステップを記録する', () => {
    const steps = detectAmmoSteps(ammoTimeline([5, 5, 4, 4]), CALIBRATION, PARAMS);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      tMs: at(2),
      input: 'sub',
      detector: 'ammo',
      caveat: 'none',
      confidence: DETECTION_CONFIDENCE.ammoSingleDecrease,
    });
  });

  it('増加（リロード）では記録しない', () => {
    expect(detectAmmoSteps(ammoTimeline([1, 2, 3, 5]), CALIBRATION, PARAMS)).toEqual([]);
  });

  it('変化が無ければ記録しない', () => {
    expect(detectAmmoSteps(ammoTimeline([7, 7, 7]), CALIBRATION, PARAMS)).toEqual([]);
  });

  it('2 以上の減少は 1 減少より低い信頼度を割り当てる', () => {
    const steps = detectAmmoSteps(ammoTimeline([9, 6]), CALIBRATION, PARAMS);
    expect(steps[0].confidence).toBeCloseTo(DETECTION_CONFIDENCE.ammoMultiDecrease, 5);
    expect(steps[0].confidence).toBeLessThan(DETECTION_CONFIDENCE.ammoSingleDecrease);
  });

  it('桁数の違う弾数も左詰めの桁セル列として比較する', () => {
    const steps = detectAmmoSteps(ammoTimeline([10, 9]), CALIBRATION, PARAMS);
    expect(steps).toHaveLength(1);
    expect(steps[0].confidence).toBeCloseTo(DETECTION_CONFIDENCE.ammoSingleDecrease, 5);
  });

  it('設定された間隔以内で減少し続ける区間は開始 1 点に畳む', () => {
    const steps = detectAmmoSteps(ammoTimeline([5, 4, 3, 2, 1]), CALIBRATION, PARAMS);
    expect(steps).toHaveLength(1);
    expect(steps[0].tMs).toBe(at(1));
  });

  it('間隔を超えて離れた減少は別のステップとして記録する', () => {
    // フレーム 1 と 5（400ms 差）は既定の 150ms を超える
    const steps = detectAmmoSteps(
      ammoTimeline([5, 4, 4, 4, 4, 3], { frameIndexOf: (i) => i }),
      CALIBRATION,
      PARAMS,
    );
    expect(steps.map((s) => s.tMs)).toEqual([at(1), at(5)]);
  });

  it('畳む間隔を 0 にすると連射区間もすべて記録される', () => {
    const noFold: AnalysisParams = { ...PARAMS, sustainedFireGapMs: 0 };
    const steps = detectAmmoSteps(ammoTimeline([5, 4, 3, 2]), CALIBRATION, noFold);
    expect(steps.map((s) => s.tMs)).toEqual([at(1), at(2), at(3)]);
  });

  it('未解決の桁を含む区間で記述子が変化した場合は方向不明の低信頼ステップにする', () => {
    const steps = detectAmmoSteps(
      ammoTimeline([['u1', EMPTY_GLYPH], ['u2', EMPTY_GLYPH]], { bank: BANK_WITH_UNKNOWN }),
      CALIBRATION,
      PARAMS,
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      tMs: at(1),
      input: 'sub',
      caveat: 'direction_unknown',
      confidence: DETECTION_CONFIDENCE.ammoDirectionUnknown,
    });
  });

  it('未解決の桁でも表示が変わらなければ記録しない', () => {
    const steps = detectAmmoSteps(
      ammoTimeline([['u1', EMPTY_GLYPH], ['u1', EMPTY_GLYPH]], { bank: BANK_WITH_UNKNOWN }),
      CALIBRATION,
      PARAMS,
    );
    expect(steps).toEqual([]);
  });

  it('片側だけが解決できない変化も方向不明として扱う', () => {
    const steps = detectAmmoSteps(
      ammoTimeline([['d5', EMPTY_GLYPH], ['u1', EMPTY_GLYPH]], { bank: BANK_WITH_UNKNOWN }),
      CALIBRATION,
      PARAMS,
    );
    expect(steps[0].caveat).toBe('direction_unknown');
  });

  it('欠測区間をまたぐ変化はさらに信頼度を下げる', () => {
    const steps = detectAmmoSteps(
      ammoTimeline([5, 4], { gaps: [[1, at(1) - 1]] }),
      CALIBRATION,
      PARAMS,
    );
    expect(steps[0].confidence).toBeCloseTo(
      DETECTION_CONFIDENCE.ammoSingleDecrease * ACROSS_GAP_CONFIDENCE_FACTOR,
      5,
    );
    expect(steps[0].caveat).toBe('across_gap');
  });

  it('ラベルが 1 つも無い bank では数値を解決せず方向不明になる', () => {
    const steps = detectAmmoSteps(
      ammoTimeline([['x1', EMPTY_GLYPH], ['x2', EMPTY_GLYPH]], { bank: EMPTY_BANK }),
      CALIBRATION,
      PARAMS,
    );
    expect(steps[0].caveat).toBe('direction_unknown');
  });

  it('複数スロットの減少をそれぞれの入力種別で記録し、時刻の昇順で返す', () => {
    const calibration = calibrationOf([
      slot({ id: 'slot-1', inputType: 'shot' }),
      slot({ id: 'slot-2', index: 1, inputType: 'special-shot' }),
    ]);
    const first = [5, 5, 4, 4];
    const second = [3, 3, 3, 2];
    const samples = first.map((v, i) =>
      frame(i, [
        slotSample({ slotId: 'slot-1', digits: digitsOf(v) }),
        slotSample({ slotId: 'slot-2', digits: digitsOf(second[i]) }),
      ]),
    );
    const steps = detectAmmoSteps(
      timelineOf(samples, { glyphBank: DIGIT_BANK }),
      calibration,
      PARAMS,
    );
    expect(steps.map((s) => [s.tMs, s.input])).toEqual([
      [at(2), 'shot'],
      [at(3), 'special-shot'],
    ]);
  });

  it('畳み込みはスロットごとに独立して働く', () => {
    const calibration = calibrationOf([
      slot({ id: 'slot-1', inputType: 'shot' }),
      slot({ id: 'slot-2', index: 1, inputType: 'special-shot' }),
    ]);
    const samples = [5, 4, 3].map((v, i) =>
      frame(i, [
        slotSample({ slotId: 'slot-1', digits: digitsOf(v) }),
        slotSample({ slotId: 'slot-2', digits: digitsOf(v) }),
      ]),
    );
    const steps = detectAmmoSteps(
      timelineOf(samples, { glyphBank: DIGIT_BANK }),
      calibration,
      PARAMS,
    );
    expect(steps.map((s) => s.input).sort()).toEqual(['shot', 'special-shot']);
  });

  it('格闘を出力しない', () => {
    const steps = detectAmmoSteps(ammoTimeline([5, 4, 3]), CALIBRATION, PARAMS);
    expect(steps.every((s) => s.input !== 'melee')).toBe(true);
  });

  it('信頼度は 0..1 に収まり、結果は時刻の昇順になる', () => {
    const steps = detectAmmoSteps(
      ammoTimeline([5, 4, 4, 4, 4, 3, 3, 3, 3, 1]),
      CALIBRATION,
      PARAMS,
    );
    const times = steps.map((s) => s.tMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const step of steps) {
      expect(step.confidence).toBeGreaterThanOrEqual(0);
      expect(step.confidence).toBeLessThanOrEqual(1);
    }
    expect(FRAME_MS).toBe(100);
  });
});
