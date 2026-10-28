/**
 * CHARGE 表示の変化からチャージ入力を検出する純関数。
 *
 * 点灯・消灯の確定に連続フレーム数の下限を設けるのは、圧縮ノイズや
 * エフェクトの重なりによる 1 フレームのちらつきを入力として拾わないため。
 * 下限は開始と終了の両方に掛ける。片側だけだと、点灯中の 1 フレーム消灯が
 * 終了と再開の対を生んでしまう。
 */
import {
  ACROSS_GAP_CONFIDENCE_FACTOR,
  CHARGE_LOW_MARGIN_THRESHOLD,
  DETECTION_CONFIDENCE,
} from '../constants';
import type {
  AnalysisParams,
  ChargeKind,
  DetectedStep,
  HudCalibration,
  SampleTimeline,
  SlotSample,
} from '../types';
import { crossesGap } from './gaps';

const CHARGE_INPUTS: Readonly<
  Record<ChargeKind, { readonly start: DetectedStep['input']; readonly end: DetectedStep['input'] }>
> = {
  shot: { start: 'shot-charge-start', end: 'shot-charge-end' },
  melee: { start: 'melee-charge-start', end: 'melee-charge-end' },
};

/** 点灯状態が変わった位置。index は変化後の状態になった最初のフレーム */
type Transition = {
  readonly index: number;
  readonly on: boolean;
};

/**
 * 連続フレーム数の下限で均した状態変化を列挙する。
 * 走査開始時は消灯とみなすため、冒頭から点灯していれば先頭が開始になる。
 */
function confirmedTransitions(
  values: readonly boolean[],
  minFrames: number,
): readonly Transition[] {
  const transitions: Transition[] = [];
  const required = Math.max(1, minFrames);
  let state = false;
  let candidateStart = -1;
  let candidateLength = 0;

  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === state) {
      candidateStart = -1;
      candidateLength = 0;
      continue;
    }
    if (candidateStart === -1) {
      candidateStart = i;
      candidateLength = 1;
    } else {
      candidateLength += 1;
    }
    if (candidateLength >= required) {
      state = values[i];
      transitions.push({ index: candidateStart, on: state });
      candidateStart = -1;
      candidateLength = 0;
    }
  }

  return transitions;
}

export function detectChargeSteps(
  timeline: SampleTimeline,
  calibration: HudCalibration,
  params: AnalysisParams,
): readonly DetectedStep[] {
  const steps: DetectedStep[] = [];

  for (const slot of calibration.slots) {
    if (slot.chargeRect === null || slot.chargeKind === null) continue;
    const inputs = CHARGE_INPUTS[slot.chargeKind];

    const observed: { readonly tMs: number; readonly sample: SlotSample }[] = [];
    for (const sample of timeline.samples) {
      const found = sample.slots.find((s) => s.slotId === slot.id);
      if (found !== undefined) observed.push({ tMs: sample.tMs, sample: found });
    }
    if (observed.length === 0) continue;

    const transitions = confirmedTransitions(
      observed.map((o) => o.sample.chargeOn),
      params.chargeMinOnFrames,
    );

    for (const transition of transitions) {
      const current = observed[transition.index];
      const previous = observed[transition.index - 1];
      const lowMargin = current.sample.chargeMargin < CHARGE_LOW_MARGIN_THRESHOLD;
      const overGap =
        previous !== undefined && crossesGap(timeline.gaps, previous.tMs, current.tMs);

      const base = lowMargin
        ? DETECTION_CONFIDENCE.chargeLowMargin
        : DETECTION_CONFIDENCE.chargeClear;

      steps.push({
        tMs: current.tMs,
        input: transition.on ? inputs.start : inputs.end,
        confidence: overGap ? base * ACROSS_GAP_CONFIDENCE_FACTOR : base,
        detector: 'charge',
        // 欠測をまたいだことの方が、閾値への近さより強い警告になる
        caveat: overGap ? 'across_gap' : lowMargin ? 'low_margin' : 'none',
      });
    }
  }

  return steps.sort((a, b) => a.tMs - b.tMs);
}
