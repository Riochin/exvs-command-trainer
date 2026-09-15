/**
 * 画素領域から記述子を導く純関数群。
 *
 * この層は DOM に一切触れない。入力は画素の配列（`PixelRegion`）だけであり、
 * 出力は値だけ。canvas や video の都合をここへ持ち込まないことが、
 * 解析ロジックを単体テストできる唯一の根拠になる。
 */
import { GLYPH_DESCRIPTOR_LENGTH, GLYPH_GRID_SIZE } from '../constants';
import type { GlyphDescriptor, PixelRegion } from '../types';

/** Rec.709 の輝度重み。色相ではなく明るさで判定するための係数 */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/**
 * グリフとして扱うのに必要な最小コントラスト。
 * これを下回る領域は「何も描かれていない」と判断する。
 * min-max 正規化はノイズも増幅するため、増幅する前にここで弾く。
 */
const MIN_GLYPH_CONTRAST = 0.12;

/** 正規化後の輝度がこれ以上の画素をインク（描画）とみなす */
const INK_LUMINANCE_THRESHOLD = 0.5;

/** インク割合がこれ以下なら空セルとみなす */
export const EMPTY_INK_RATIO_MAX = 0.02;

/** ゲージの明暗を相対判定するのに必要な最小コントラスト */
const MIN_GAUGE_CONTRAST = 0.12;

/** コントラストが足りないゲージを全消灯／全点灯へ振り分ける絶対輝度 */
const GAUGE_ABSOLUTE_THRESHOLD = 0.5;

const EMPTY_DESCRIPTOR: GlyphDescriptor = {
  features: Object.freeze(new Array<number>(GLYPH_DESCRIPTOR_LENGTH).fill(0)),
  inkRatio: 0,
};

/** 画素 i（RGBA 先頭オフセット）の輝度を 0..1 で返す */
function luminanceAt(data: Uint8ClampedArray, offset: number): number {
  return (
    (LUMA_R * data[offset] + LUMA_G * data[offset + 1] + LUMA_B * data[offset + 2]) / 255
  );
}

function hasPixels(region: PixelRegion): boolean {
  return region.width > 0 && region.height > 0 && region.data.length >= region.width * region.height * 4;
}

/** 領域全体の輝度を 1 画素ずつ取り出す */
function luminances(region: PixelRegion): Float64Array {
  const count = region.width * region.height;
  const out = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = luminanceAt(region.data, i * 4);
  }
  return out;
}

/**
 * 桁セルの画素から記述子を求める。
 *
 * 大きさの違いは固定グリッドへの畳み込みで、明るさの違いは min-max 正規化で
 * 吸収する。どちらも吸収しないと、同じ数字が解像度や配信の明るさごとに
 * 別クラスタへ散ってしまう。
 */
export function computeGlyphDescriptor(region: PixelRegion): GlyphDescriptor {
  if (!hasPixels(region)) return EMPTY_DESCRIPTOR;

  const values = luminances(region);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }

  const contrast = max - min;
  if (contrast < MIN_GLYPH_CONTRAST) return EMPTY_DESCRIPTOR;

  const sums = new Float64Array(GLYPH_DESCRIPTOR_LENGTH);
  const counts = new Uint32Array(GLYPH_DESCRIPTOR_LENGTH);
  let inkPixels = 0;

  for (let y = 0; y < region.height; y += 1) {
    const row = Math.min(GLYPH_GRID_SIZE - 1, Math.floor((y * GLYPH_GRID_SIZE) / region.height));
    for (let x = 0; x < region.width; x += 1) {
      const col = Math.min(GLYPH_GRID_SIZE - 1, Math.floor((x * GLYPH_GRID_SIZE) / region.width));
      const normalized = (values[y * region.width + x] - min) / contrast;
      const cell = row * GLYPH_GRID_SIZE + col;
      sums[cell] += normalized;
      counts[cell] += 1;
      if (normalized >= INK_LUMINANCE_THRESHOLD) inkPixels += 1;
    }
  }

  const features = new Array<number>(GLYPH_DESCRIPTOR_LENGTH);
  for (let i = 0; i < GLYPH_DESCRIPTOR_LENGTH; i += 1) {
    features[i] = counts[i] === 0 ? 0 : sums[i] / counts[i];
  }

  return { features, inkRatio: inkPixels / values.length };
}

/** インクをほとんど含まない記述子か。空の桁セルの判別に使う */
export function isEmptyGlyph(descriptor: GlyphDescriptor): boolean {
  return descriptor.inkRatio <= EMPTY_INK_RATIO_MAX;
}

/**
 * 記述子同士の距離を 0..1 で返す。
 *
 * クラスタリングと照合が同じ尺度を使うよう、距離はこの関数だけが決める。
 * 二乗平均平方根を使うので、特徴量の長さが変わっても閾値の意味が変わらない。
 */
export function descriptorDistance(a: GlyphDescriptor, b: GlyphDescriptor): number {
  if (a.features.length !== b.features.length || a.features.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < a.features.length; i += 1) {
    const diff = a.features[i] - b.features[i];
    sum += diff * diff;
  }
  return Math.min(1, Math.sqrt(sum / a.features.length));
}

/** 領域の平均輝度を 0..1 で返す。CHARGE 点灯判定の材料 */
export function computeNormalizedLuminance(region: PixelRegion): number {
  if (!hasPixels(region)) return 0;
  const values = luminances(region);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
}

/**
 * 横長ゲージの充填率を 0..1 で返す。
 *
 * 列ごとの平均輝度を取り、明暗が分かれていればその中間で二値化する。
 * 分かれていない（全消灯・全点灯）場合だけ絶対輝度で振り分ける。
 */
export function computeFillRatio(region: PixelRegion): number {
  if (!hasPixels(region)) return 0;

  const values = luminances(region);
  const columns = new Float64Array(region.width);
  for (let x = 0; x < region.width; x += 1) {
    let sum = 0;
    for (let y = 0; y < region.height; y += 1) sum += values[y * region.width + x];
    columns[x] = sum / region.height;
  }

  let min = Infinity;
  let max = -Infinity;
  for (let x = 0; x < columns.length; x += 1) {
    if (columns[x] < min) min = columns[x];
    if (columns[x] > max) max = columns[x];
  }

  if (max - min < MIN_GAUGE_CONTRAST) {
    return (min + max) / 2 >= GAUGE_ABSOLUTE_THRESHOLD ? 1 : 0;
  }

  const threshold = (min + max) / 2;
  let filled = 0;
  for (let x = 0; x < columns.length; x += 1) {
    if (columns[x] >= threshold) filled += 1;
  }
  return filled / columns.length;
}
