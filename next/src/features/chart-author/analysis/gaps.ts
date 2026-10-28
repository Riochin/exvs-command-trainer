/**
 * 走査の欠測区間の扱い。
 *
 * 欠測は「無かったこと」にしない。またいで観測された変化は、実際には
 * その間のどこで起きたか分からないため、検出器はここで判定して信頼度を下げる。
 */

/** 区間 (fromMs, toMs] が欠測区間と重なるか */
export function crossesGap(
  gaps: readonly (readonly [number, number])[],
  fromMs: number,
  toMs: number,
): boolean {
  return gaps.some(([start, end]) => start < toMs && end > fromMs);
}
