/**
 * 検出器を統合して、ステップ列と集計を返す純関数。
 *
 * 各検出器は自分の証拠しか見ない。それらを 1 本の時刻順の列にまとめるのが
 * ここの役目で、同じ観測列と同じパラメータに対しては常に同じ結果を返す。
 * この決定性が、パラメータを変えた直後の再計算と単体テストの土台になる。
 */
import type {
  AnalysisParams,
  DetectedStep,
  DetectionSummary,
  HudCalibration,
  SampleTimeline,
} from '../types';
import { detectAmmoSteps } from './ammoDetector';
import { detectBoostSteps } from './boostDetector';
import { detectChargeSteps } from './chargeDetector';

/** 同時刻のステップの並びを入力に依らず決めるための序列 */
const DETECTOR_ORDER: Readonly<Record<DetectedStep['detector'], number>> = {
  ammo: 0,
  charge: 1,
  boost: 2,
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function summarize(steps: readonly DetectedStep[]): DetectionSummary {
  const countsByInput: Record<string, number> = {};
  for (const step of steps) {
    countsByInput[step.input] = (countsByInput[step.input] ?? 0) + 1;
  }
  return { countsByInput, total: steps.length };
}

export function runDetectors(
  timeline: SampleTimeline,
  calibration: HudCalibration,
  params: AnalysisParams,
): { readonly steps: readonly DetectedStep[]; readonly summary: DetectionSummary } {
  const steps = [
    ...detectAmmoSteps(timeline, calibration, params),
    ...detectChargeSteps(timeline, calibration, params),
    ...detectBoostSteps(timeline, params),
  ]
    .map((step) => ({ ...step, confidence: clampConfidence(step.confidence) }))
    .sort(
      (a, b) =>
        a.tMs - b.tMs || DETECTOR_ORDER[a.detector] - DETECTOR_ORDER[b.detector],
    );

  return { steps, summary: summarize(steps) };
}
