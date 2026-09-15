import { describe, it, expect } from 'vitest';
import { detectBoostSteps } from '@/features/chart-author/analysis/boostDetector';
import {
  DEFAULT_ANALYSIS_PARAMS,
  DETECTION_CONFIDENCE,
} from '@/features/chart-author/constants';
import type { AnalysisParams, SampleTimeline } from '@/features/chart-author/types';
import { FRAME_MS, at, frame, slotSample, timelineOf } from './helpers';

/** 既定では 1 フレーム（100ms）の窓に収まる低下だけを急減とみなす */
const PARAMS: AnalysisParams = {
  ...DEFAULT_ANALYSIS_PARAMS,
  boostDropThreshold: 0.06,
  boostDropWindowMs: FRAME_MS,
};

/** 充填率の並びを観測列にする */
function boostTimeline(fills: readonly number[]): SampleTimeline {
  return timelineOf(fills.map((fill, i) => frame(i, [slotSample()], fill)));
}

describe('detectBoostSteps', () => {
  it('時間窓内の急減を低下の開始時点で記録する', () => {
    const steps = detectBoostSteps(boostTimeline([1, 1, 1, 0.7, 0.7, 0.7]), PARAMS);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      tMs: at(2),
      input: 'bd',
      detector: 'boost',
      caveat: 'none',
    });
  });

  it('緩やかな連続消費では記録しない', () => {
    const gentle = [1, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.86];
    expect(detectBoostSteps(boostTimeline(gentle), PARAMS)).toEqual([]);
  });

  it('ゲージの回復では記録しない', () => {
    expect(detectBoostSteps(boostTimeline([0.2, 0.5, 0.8, 1, 1]), PARAMS)).toEqual([]);
  });

  it('閾値ちょうどの低下は記録し、わずかに足りない低下は記録しない', () => {
    expect(detectBoostSteps(boostTimeline([1, 0.94]), PARAMS)).toHaveLength(1);
    expect(detectBoostSteps(boostTimeline([1, 0.941]), PARAMS)).toEqual([]);
  });

  it('閾値を外から与えると検出の粒度が変わる', () => {
    const fills = [1, 1, 0.9, 0.9];
    const loose: AnalysisParams = { ...PARAMS, boostDropThreshold: 0.05 };
    const strict: AnalysisParams = { ...PARAMS, boostDropThreshold: 0.2 };
    expect(detectBoostSteps(boostTimeline(fills), loose)).toHaveLength(1);
    expect(detectBoostSteps(boostTimeline(fills), strict)).toEqual([]);
  });

  it('時間窓を広げると緩やかな低下も急減として拾える', () => {
    const gentle = [1, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.86];
    const wide: AnalysisParams = { ...PARAMS, boostDropWindowMs: FRAME_MS * 5 };
    expect(detectBoostSteps(boostTimeline(gentle), wide).length).toBeGreaterThan(0);
  });

  it('既定値だけでも動作する', () => {
    const steps = detectBoostSteps(
      boostTimeline([1, 1, 0.5, 0.5]),
      DEFAULT_ANALYSIS_PARAMS,
    );
    expect(steps).toHaveLength(1);
  });

  it('連続した 2 回の急減はそれぞれ記録する', () => {
    const steps = detectBoostSteps(
      boostTimeline([1, 1, 0.8, 0.8, 0.8, 0.6, 0.6, 0.6]),
      PARAMS,
    );
    expect(steps.map((s) => s.tMs)).toEqual([at(1), at(4)]);
  });

  it('弾数由来のステップより必ず低い信頼度を割り当てる', () => {
    const steps = detectBoostSteps(boostTimeline([1, 1, 0.7, 0.7]), PARAMS);
    expect(steps[0].confidence).toBeCloseTo(DETECTION_CONFIDENCE.boostDrop, 5);
    expect(steps[0].confidence).toBeLessThan(DETECTION_CONFIDENCE.ammoDirectionUnknown);
    expect(steps[0].confidence).toBeLessThan(DETECTION_CONFIDENCE.ammoMultiDecrease);
    expect(steps[0].confidence).toBeLessThan(DETECTION_CONFIDENCE.ammoSingleDecrease);
  });

  it('観測が無い、または 1 フレームだけの場合は記録しない', () => {
    expect(detectBoostSteps(boostTimeline([]), PARAMS)).toEqual([]);
    expect(detectBoostSteps(boostTimeline([1]), PARAMS)).toEqual([]);
  });

  it('結果は時刻の昇順で、信頼度は 0..1 に収まる', () => {
    const steps = detectBoostSteps(
      boostTimeline([1, 1, 0.8, 0.8, 0.8, 0.6, 0.6, 0.6]),
      PARAMS,
    );
    const times = steps.map((s) => s.tMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const step of steps) {
      expect(step.confidence).toBeGreaterThanOrEqual(0);
      expect(step.confidence).toBeLessThanOrEqual(1);
    }
  });
});
