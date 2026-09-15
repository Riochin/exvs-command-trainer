/**
 * 弾数の推移から射撃系入力を検出する純関数。
 *
 * 弾数の減少は「撃った」ことの最も直接的な証拠であり、この検出器が
 * 最も高い信頼度を出す。ただし桁が数字として解決できない場合に推測で
 * 埋めることはしない。その場合は「表示が変わったこと」だけを根拠にした
 * 方向不明の候補に落とし、確認を要する旨を添える。
 */
import {
  ACROSS_GAP_CONFIDENCE_FACTOR,
  DETECTION_CONFIDENCE,
} from '../constants';
import type {
  AnalysisParams,
  DetectedStep,
  GlyphKey,
  HudCalibration,
  SampleTimeline,
  SlotSample,
} from '../types';
import { crossesGap } from './gaps';
import { resolveGlyphValue } from './glyphBank';

type Observation = {
  readonly tMs: number;
  readonly sample: SlotSample;
};

function sameDigits(a: readonly GlyphKey[], b: readonly GlyphKey[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

/** 校正上のスロットに対応する観測だけを時刻順に集める */
function observationsOf(timeline: SampleTimeline, slotId: string): readonly Observation[] {
  const observed: Observation[] = [];
  for (const sample of timeline.samples) {
    const found = sample.slots.find((s) => s.slotId === slotId);
    if (found !== undefined) observed.push({ tMs: sample.tMs, sample: found });
  }
  return observed;
}

export function detectAmmoSteps(
  timeline: SampleTimeline,
  calibration: HudCalibration,
  params: AnalysisParams,
): readonly DetectedStep[] {
  const steps: DetectedStep[] = [];

  for (const slot of calibration.slots) {
    const observed = observationsOf(timeline, slot.id);
    /** 直近に採用した減少の時刻。連射を 1 点へ畳むための基準 */
    let lastDecreaseTMs: number | null = null;

    for (let i = 1; i < observed.length; i += 1) {
      const previous = observed[i - 1];
      const current = observed[i];
      const overGap = crossesGap(timeline.gaps, previous.tMs, current.tMs);

      const before = resolveGlyphValue(timeline.glyphBank, previous.sample.digits);
      const after = resolveGlyphValue(timeline.glyphBank, current.sample.digits);

      if (before !== null && after !== null) {
        // リロードは入力ではない。撃ち切りからの回復で連射の区間も切れる
        if (after > before) {
          lastDecreaseTMs = null;
          continue;
        }
        if (after === before) continue;

        // 連射中は減少の間に同じ弾数のフレームが挟まるため、
        // 区間の判定は「直近の減少からの経過時間」だけで行う
        if (
          lastDecreaseTMs !== null &&
          current.tMs - lastDecreaseTMs <= params.sustainedFireGapMs
        ) {
          lastDecreaseTMs = current.tMs;
          continue;
        }

        const base =
          before - after === 1
            ? DETECTION_CONFIDENCE.ammoSingleDecrease
            : DETECTION_CONFIDENCE.ammoMultiDecrease;

        steps.push({
          tMs: current.tMs,
          input: slot.inputType,
          confidence: overGap ? base * ACROSS_GAP_CONFIDENCE_FACTOR : base,
          detector: 'ammo',
          caveat: overGap ? 'across_gap' : 'none',
        });
        lastDecreaseTMs = current.tMs;
        continue;
      }

      // 数値として読めない。表示が変わったことだけを根拠にする
      if (sameDigits(previous.sample.digits, current.sample.digits)) continue;

      const base = DETECTION_CONFIDENCE.ammoDirectionUnknown;
      steps.push({
        tMs: current.tMs,
        input: slot.inputType,
        confidence: overGap ? base * ACROSS_GAP_CONFIDENCE_FACTOR : base,
        detector: 'ammo',
        // 欠測をまたいだことの方が、方向の不明さより強い警告になる
        caveat: overGap ? 'across_gap' : 'direction_unknown',
      });
      lastDecreaseTMs = null;
    }
  }

  return steps.sort((a, b) => a.tMs - b.tMs);
}
