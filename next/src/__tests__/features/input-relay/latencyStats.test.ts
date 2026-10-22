import { describe, it, expect } from 'vitest';
import {
  estimateClockOffset,
  oneWayLatency,
  pushBounded,
  roundTripTime,
  summarize,
} from '@/features/input-relay/latencyStats';

describe('latencyStats', () => {
  it('RTT は t2 - t0', () => {
    expect(roundTripTime({ t0: 100, t1: 5, t2: 110 })).toBe(10);
  });

  it('サンプルがなければオフセットは null', () => {
    expect(estimateClockOffset([])).toBeNull();
  });

  it('対称な往復なら送信側の時刻ずれをそのまま求める', () => {
    // 送信側の時計はホストより 1000ms 遅れている。片道 5ms。
    expect(estimateClockOffset([{ t0: 2000, t1: 1005, t2: 2010 }])).toBe(1000);
  });

  it('RTT 最小のサンプルでオフセットを求める', () => {
    const samples = [
      { t0: 0, t1: -980, t2: 60 }, // RTT 60（行きだけ遅い）
      { t0: 100, t1: -896, t2: 108 }, // RTT 8
    ];
    expect(estimateClockOffset(samples)).toBe(1000);
  });

  it('片道遅延はオフセットで時間軸を合わせて求める', () => {
    expect(oneWayLatency(500, 1507, 1000)).toBe(7);
  });

  it('統計値を求める', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(summarize(values)).toEqual({ count: 20, latest: 20, mean: 10.5, p95: 19, max: 20 });
  });

  it('値がなければ統計は null', () => {
    expect(summarize([])).toBeNull();
  });

  it('pushBounded は直近の件数だけ残す', () => {
    expect(pushBounded([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    expect(pushBounded([1], 2, 3)).toEqual([1, 2]);
  });
});
