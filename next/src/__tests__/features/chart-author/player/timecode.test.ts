import { describe, it, expect } from 'vitest';
import { formatTimecode } from '@/features/chart-author/player/timecode';

describe('formatTimecode', () => {
  it('先頭を 0 で埋めた mm:ss.mmm で表す', () => {
    expect(formatTimecode(0)).toBe('00:00.000');
    expect(formatTimecode(5)).toBe('00:00.005');
    expect(formatTimecode(1_000)).toBe('00:01.000');
    expect(formatTimecode(65_432)).toBe('01:05.432');
  });

  it('60 分を超えても分をそのまま積む', () => {
    expect(formatTimecode(3_600_000)).toBe('60:00.000');
  });

  it('ミリ秒未満は切り捨てる', () => {
    expect(formatTimecode(1_234.9)).toBe('00:01.234');
  });

  it('負の時刻は 0 として扱う', () => {
    expect(formatTimecode(-1)).toBe('00:00.000');
  });
});
