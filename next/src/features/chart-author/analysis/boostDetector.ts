/**
 * ブーストゲージの急減からブーストダッシュの候補を検出する純関数。
 *
 * ブーストは踏んだ瞬間に大きく削れ、空中で維持していると緩やかに減る。
 * この「短い時間窓での大きな低下」だけを拾うことで、連続消費や回復と区別する。
 * ただしゲージは他の要因（被弾・覚醒など）でも動くため、ここで得られるのは
 * あくまで候補であり、弾数由来より低い信頼度しか与えない。
 */
import { DETECTION_CONFIDENCE } from '../constants';
import type { AnalysisParams, DetectedStep, SampleTimeline } from '../types';

export function detectBoostSteps(
  timeline: SampleTimeline,
  params: AnalysisParams,
): readonly DetectedStep[] {
  const samples = timeline.samples;
  const steps: DetectedStep[] = [];

  let left = 0;
  let i = 1;
  while (i < samples.length) {
    const windowStartMs = samples[i].tMs - params.boostDropWindowMs;
    while (left < i && samples[left].tMs < windowStartMs) left += 1;

    // 窓の中で最も高かった時点が「低下の開始」。既定の窓は数フレームなので素直に探す
    let peak = left;
    for (let j = left; j < i; j += 1) {
      if (samples[j].boostFill > samples[peak].boostFill) peak = j;
    }

    const drop = samples[peak].boostFill - samples[i].boostFill;
    if (drop >= params.boostDropThreshold) {
      steps.push({
        tMs: samples[peak].tMs,
        input: 'bd',
        confidence: DETECTION_CONFIDENCE.boostDrop,
        detector: 'boost',
        caveat: 'none',
      });
      // 同じ低下を窓が重なるぶんだけ二重に数えないよう、低下しきった時点から窓を張り直す
      left = i;
    }
    i += 1;
  }

  return steps;
}
