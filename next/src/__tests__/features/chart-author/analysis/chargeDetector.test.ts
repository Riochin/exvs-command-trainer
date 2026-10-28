import { describe, it, expect } from 'vitest';
import { detectChargeSteps } from '@/features/chart-author/analysis/chargeDetector';
import {
  ACROSS_GAP_CONFIDENCE_FACTOR,
  DEFAULT_ANALYSIS_PARAMS,
  DETECTION_CONFIDENCE,
} from '@/features/chart-author/constants';
import type { AnalysisParams, SampleTimeline } from '@/features/chart-author/types';
import { at, calibrationOf, frame, slot, slotSample, timelineOf } from './helpers';

const PARAMS: AnalysisParams = { ...DEFAULT_ANALYSIS_PARAMS, chargeMinOnFrames: 2 };

/** '0'/'1' の並びを CHARGE の点灯観測列にする */
function chargeTimeline(
  pattern: string,
  opts: {
    margins?: readonly number[];
    gaps?: readonly (readonly [number, number])[];
  } = {},
): SampleTimeline {
  const samples = [...pattern].map((c, i) =>
    frame(i, [slotSample({ chargeOn: c === '1', chargeMargin: opts.margins?.[i] ?? 1 })]),
  );
  return timelineOf(samples, { gaps: opts.gaps });
}

const chargeSlot = calibrationOf([
  slot({ chargeRect: { x: 0.2, y: 0.2, width: 0.05, height: 0.05 }, chargeKind: 'shot' }),
]);

describe('detectChargeSteps', () => {
  it('消灯から点灯で開始、点灯から消灯で終了を対で記録する', () => {
    const steps = detectChargeSteps(chargeTimeline('0011110000'), chargeSlot, PARAMS);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      tMs: at(2),
      input: 'shot-charge-start',
      detector: 'charge',
    });
    expect(steps[1]).toMatchObject({ tMs: at(6), input: 'shot-charge-end' });
  });

  it('格闘系のチャージ種別では格闘のチャージ入力を割り当てる', () => {
    const melee = calibrationOf([
      slot({
        chargeRect: { x: 0.2, y: 0.2, width: 0.05, height: 0.05 },
        chargeKind: 'melee',
      }),
    ]);
    const steps = detectChargeSteps(chargeTimeline('0011110000'), melee, PARAMS);
    expect(steps.map((s) => s.input)).toEqual([
      'melee-charge-start',
      'melee-charge-end',
    ]);
  });

  it('1 フレームだけのちらつきは検出しない', () => {
    expect(detectChargeSteps(chargeTimeline('0010000'), chargeSlot, PARAMS)).toEqual([]);
  });

  it('点灯中の 1 フレームだけの消灯で終了と再開を作らない', () => {
    const steps = detectChargeSteps(chargeTimeline('0011101110000'), chargeSlot, PARAMS);
    expect(steps.map((s) => s.input)).toEqual(['shot-charge-start', 'shot-charge-end']);
  });

  it('確定に要する連続フレーム数を増やすと短い点灯は拾われない', () => {
    const strict: AnalysisParams = { ...PARAMS, chargeMinOnFrames: 4 };
    expect(detectChargeSteps(chargeTimeline('0011000'), chargeSlot, strict)).toEqual([]);
    expect(
      detectChargeSteps(chargeTimeline('0011110000'), chargeSlot, strict),
    ).toHaveLength(2);
  });

  it('冒頭から点灯している場合は先頭で開始を記録する', () => {
    const steps = detectChargeSteps(chargeTimeline('1111'), chargeSlot, PARAMS);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ tMs: at(0), input: 'shot-charge-start' });
  });

  it('終了しないまま走査が終わった場合は開始のみを記録する', () => {
    const steps = detectChargeSteps(chargeTimeline('001111'), chargeSlot, PARAMS);
    expect(steps.map((s) => s.input)).toEqual(['shot-charge-start']);
  });

  it('余裕が十分な変化には高い信頼度を与える', () => {
    const steps = detectChargeSteps(chargeTimeline('001100'), chargeSlot, PARAMS);
    expect(steps[0].confidence).toBeCloseTo(DETECTION_CONFIDENCE.chargeClear, 5);
    expect(steps[0].caveat).toBe('none');
  });

  it('輝度が閾値の近くにある変化は信頼度を下げ、確認を要する旨を添える', () => {
    const margins = [1, 1, 0.02, 1, 1, 1];
    const steps = detectChargeSteps(
      chargeTimeline('001100', { margins }),
      chargeSlot,
      PARAMS,
    );
    expect(steps[0].confidence).toBeCloseTo(DETECTION_CONFIDENCE.chargeLowMargin, 5);
    expect(steps[0].caveat).toBe('low_margin');
  });

  it('欠測区間をまたぐ変化はさらに信頼度を下げる', () => {
    const steps = detectChargeSteps(
      chargeTimeline('001100', { gaps: [[at(1) + 1, at(2) - 1]] }),
      chargeSlot,
      PARAMS,
    );
    expect(steps[0].confidence).toBeCloseTo(
      DETECTION_CONFIDENCE.chargeClear * ACROSS_GAP_CONFIDENCE_FACTOR,
      5,
    );
    expect(steps[0].caveat).toBe('across_gap');
  });

  it('信頼度は 0..1 に収まる', () => {
    const steps = detectChargeSteps(chargeTimeline('0011110000'), chargeSlot, PARAMS);
    for (const step of steps) {
      expect(step.confidence).toBeGreaterThanOrEqual(0);
      expect(step.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('CHARGE 領域が設定されていないスロットは検出しない', () => {
    const noCharge = calibrationOf([slot({ chargeRect: null, chargeKind: null })]);
    expect(detectChargeSteps(chargeTimeline('0011110000'), noCharge, PARAMS)).toEqual([]);
  });

  it('チャージ種別が未設定のスロットは検出しない', () => {
    const noKind = calibrationOf([
      slot({ chargeRect: { x: 0.2, y: 0.2, width: 0.05, height: 0.05 }, chargeKind: null }),
    ]);
    expect(detectChargeSteps(chargeTimeline('0011110000'), noKind, PARAMS)).toEqual([]);
  });

  it('複数スロットの検出結果を時刻の昇順で返す', () => {
    const two = calibrationOf([
      slot({
        id: 'slot-1',
        chargeRect: { x: 0.2, y: 0.2, width: 0.05, height: 0.05 },
        chargeKind: 'shot',
      }),
      slot({
        id: 'slot-2',
        index: 1,
        chargeRect: { x: 0.3, y: 0.2, width: 0.05, height: 0.05 },
        chargeKind: 'melee',
      }),
    ]);
    const first = '00111100';
    const second = '00001111';
    const samples = [...first].map((c, i) =>
      frame(i, [
        slotSample({ slotId: 'slot-1', chargeOn: c === '1' }),
        slotSample({ slotId: 'slot-2', chargeOn: second[i] === '1' }),
      ]),
    );
    const steps = detectChargeSteps(timelineOf(samples), two, PARAMS);
    const times = steps.map((s) => s.tMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(steps.map((s) => s.input)).toEqual([
      'shot-charge-start',
      'melee-charge-start',
      'shot-charge-end',
    ]);
  });
});
