/**
 * 再生位置の表記。
 *
 * コマ送りで 1/30 秒ずつ動かす画面なので、秒までの表示では動いたことが
 * 分からない。ミリ秒まで常に見せる（Req 1.6）。
 */

/** ミリ秒を `mm:ss.mmm` に整える。ミリ秒未満は切り捨て、負の値は 0 とみなす */
export function formatTimecode(tMs: number): string {
  const total = Math.max(0, Math.floor(tMs));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    millis,
  ).padStart(3, '0')}`;
}
