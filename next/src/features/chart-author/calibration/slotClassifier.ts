/**
 * ボタン表示（3 つの丸）からスロットの入力種別を推定する純関数。
 *
 * ここは推定するだけで確定しない。実映像で丸の配置や色が想定と違う可能性が
 * 残るため、ユーザーによる上書きが唯一の保険になる。判定できないものは
 * null を返し、既定値で埋めない。
 */
import type { PixelRegion, ShootingInputType } from '../types';

export type SlotClassification = {
  readonly inputType: ShootingInputType;
  readonly confidence: number;
};

/** ボタン表示の丸の数。左から 射撃・格闘・ジャンプ */
const INDICATOR_CELLS = 3;

/** 点灯と消灯を相対判定するのに必要な最小の明るさ差 */
const MIN_LIT_SEPARATION = 0.15;

/** 差が足りない（全点灯か全消灯）ときに使う絶対閾値 */
const ABSOLUTE_LIT_THRESHOLD = 0.4;

/** 支配的な色チャンネルとみなすのに必要な、2 番手に対する比 */
const DOMINANT_CHANNEL_RATIO = 1.2;

/** 色が想定どおりだったときに確からしさへ上乗せする最大値 */
const COLOR_AGREEMENT_BONUS = 0.1;

/** 明るさだけで得られる確からしさの上限 */
const MAX_LUMINANCE_CONFIDENCE = 0.9;

type Channel = 'r' | 'g' | 'b';

/** 各丸に期待する色。あくまで補助であり、判定そのものには使わない */
const EXPECTED_CHANNELS: readonly Channel[] = ['r', 'b', 'g'];

/** 点灯の組み合わせと入力種別の対応。ArcadeController の同時押し合成規則に一致させる */
const INPUT_BY_PATTERN: Readonly<Record<string, ShootingInputType>> = {
  '100': 'shot',
  '110': 'sub',
  '101': 'special-shot',
  '011': 'special-melee',
};

type CellStat = {
  /** 平均の明るさ 0..1 */
  readonly brightness: number;
  readonly dominant: Channel | null;
};

/**
 * 丸ごとの明るさと支配的な色を求める。
 *
 * 明るさに Rec.709 の輝度ではなく最大チャンネルを使うのは、同じ強さで
 * 点灯していても彩度の高い緑と青では輝度が 2 倍以上開き、単一の閾値で
 * 点灯を切り分けられなくなるため。色相に依らない明るさが要る。
 */
function cellStats(region: PixelRegion): readonly CellStat[] | null {
  if (region.width < INDICATOR_CELLS || region.height < 1) return null;
  if (region.data.length < region.width * region.height * 4) return null;

  const sums = [0, 0, 0];
  const counts = [0, 0, 0];
  const channels = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const cell = Math.min(
        INDICATOR_CELLS - 1,
        Math.floor((x * INDICATOR_CELLS) / region.width),
      );
      const i = (y * region.width + x) * 4;
      const r = region.data[i];
      const g = region.data[i + 1];
      const b = region.data[i + 2];
      sums[cell] += Math.max(r, g, b) / 255;
      counts[cell] += 1;
      channels[cell][0] += r;
      channels[cell][1] += g;
      channels[cell][2] += b;
    }
  }

  if (counts.some((c) => c === 0)) return null;

  return counts.map((count, cell) => {
    const [r, g, b] = channels[cell];
    const sorted = [r, g, b].slice().sort((a, z) => z - a);
    const dominantIndex = [r, g, b].indexOf(sorted[0]);
    const isDominant = sorted[1] === 0 ? sorted[0] > 0 : sorted[0] / sorted[1] >= DOMINANT_CHANNEL_RATIO;
    return {
      brightness: sums[cell] / count,
      dominant: isDominant ? (['r', 'g', 'b'][dominantIndex] as Channel) : null,
    };
  });
}

/** 3 つの丸の明るさから点灯有無を決める。全点灯・全消灯は絶対閾値で振り分ける */
function litFlags(stats: readonly CellStat[]): readonly boolean[] {
  const values = stats.map((s) => s.brightness);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const threshold =
    max - min >= MIN_LIT_SEPARATION ? (min + max) / 2 : ABSOLUTE_LIT_THRESHOLD;
  return values.map((v) => v >= threshold);
}

/** 点灯した丸のうち、期待どおりの色をしていた割合 */
function colorAgreement(stats: readonly CellStat[], lit: readonly boolean[]): number {
  const litCells = stats.filter((_s, i) => lit[i]);
  if (litCells.length === 0) return 0;
  const matched = stats.filter(
    (s, i) => lit[i] && s.dominant !== null && s.dominant === EXPECTED_CHANNELS[i],
  ).length;
  return matched / litCells.length;
}

export function classifySlotInputType(indicator: PixelRegion): SlotClassification | null {
  const stats = cellStats(indicator);
  if (stats === null) return null;

  const lit = litFlags(stats);
  const inputType = INPUT_BY_PATTERN[lit.map((on) => (on ? '1' : '0')).join('')];
  if (inputType === undefined) return null;

  const litBrightness = stats.filter((_s, i) => lit[i]).map((s) => s.brightness);
  const unlitBrightness = stats.filter((_s, i) => !lit[i]).map((s) => s.brightness);
  const separation = Math.max(
    0,
    Math.min(...litBrightness) - Math.max(...unlitBrightness),
  );

  const confidence = Math.min(
    1,
    Math.min(MAX_LUMINANCE_CONFIDENCE, 0.5 + 0.4 * separation) +
      COLOR_AGREEMENT_BONUS * colorAgreement(stats, lit),
  );

  return { inputType, confidence };
}
