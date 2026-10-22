/** ping/pong 1 往復分の計測値（t0, t2 はホスト時刻、t1 は送信側時刻） */
export type PingSample = {
  t0: number;
  t1: number;
  t2: number;
};

export type LatencySummary = {
  count: number;
  latest: number;
  mean: number;
  p95: number;
  max: number;
};

export function roundTripTime(sample: PingSample): number {
  return sample.t2 - sample.t0;
}

/**
 * 送信側時刻をホスト時刻に直すためのオフセット（NTP 方式）。
 *
 * 往復が対称と仮定し、ping の中間時刻と送信側の受信時刻の差を取る。
 * 往復が短いサンプルほど非対称の誤差が小さいので、RTT 最小のサンプルを使う。
 */
export function estimateClockOffset(samples: ReadonlyArray<PingSample>): number | null {
  if (samples.length === 0) return null;
  let best = samples[0];
  for (const s of samples) {
    if (roundTripTime(s) < roundTripTime(best)) best = s;
  }
  return (best.t0 + best.t2) / 2 - best.t1;
}

/** 送信側時刻 `sentAt` のイベントをホスト時刻 `receivedAt` に受けたときの片道遅延 */
export function oneWayLatency(sentAt: number, receivedAt: number, offset: number): number {
  return receivedAt - (sentAt + offset);
}

export function summarize(values: ReadonlyArray<number>): LatencySummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: values.length,
    latest: values[values.length - 1],
    mean: sum / values.length,
    p95: sorted[p95Index],
    max: sorted[sorted.length - 1],
  };
}

/** 直近 `limit` 件だけ残して末尾に追加する */
export function pushBounded<T>(list: ReadonlyArray<T>, item: T, limit: number): T[] {
  const next = [...list, item];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
