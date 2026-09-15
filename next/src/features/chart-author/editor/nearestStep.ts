/**
 * 再生位置に最も近いステップを選ぶ規則。
 *
 * 一覧の強調（Req 6.3）と編集フックの `findNearestStep` が同じ答えを返す
 * 必要があるため、規則そのものをここ 1 箇所に置く。
 */

/**
 * `tMs` に最も近いステップを返す。候補がなければ null。
 * 等距離のときは時刻の小さい方（先に現れる方）を残す。
 */
export function findNearestStep<T extends { readonly tMs: number }>(
  steps: readonly T[],
  tMs: number,
): T | null {
  return steps.reduce<T | null>((nearest, step) => {
    if (nearest === null) return step;
    // 等距離なら手前を残す（昇順に見ているので > で比較する）
    return Math.abs(nearest.tMs - tMs) > Math.abs(step.tMs - tMs) ? step : nearest;
  }, null);
}
