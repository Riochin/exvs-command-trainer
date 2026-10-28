import { describe, it, expect } from 'vitest';
import {
  ANALYTICS_EXCLUDED_PATH_PREFIXES,
  isAnalyticsExcludedPath,
} from '@/features/analytics/excludedPaths';

describe('ANALYTICS_EXCLUDED_PATH_PREFIXES', () => {
  it('ツール配下を除外対象として持つ', () => {
    expect(ANALYTICS_EXCLUDED_PATH_PREFIXES).toContain('/tools');
  });
});

describe('isAnalyticsExcludedPath', () => {
  it('除外プレフィックスそのものを除外する', () => {
    expect(isAnalyticsExcludedPath('/tools')).toBe(true);
  });

  it('除外プレフィックス配下を除外する', () => {
    expect(isAnalyticsExcludedPath('/tools/chart-author')).toBe(true);
    expect(isAnalyticsExcludedPath('/tools/chart-author/deep')).toBe(true);
  });

  it('既存ページは除外しない', () => {
    expect(isAnalyticsExcludedPath('/')).toBe(false);
    expect(isAnalyticsExcludedPath('/commands')).toBe(false);
    expect(isAnalyticsExcludedPath('/commands/new')).toBe(false);
    expect(isAnalyticsExcludedPath('/practice/abc123')).toBe(false);
  });

  it('プレフィックスに前方一致するだけの別パスは除外しない', () => {
    expect(isAnalyticsExcludedPath('/toolsmith')).toBe(false);
    expect(isAnalyticsExcludedPath('/toolset/x')).toBe(false);
  });

  it('null に対しては計測する側に倒す', () => {
    expect(isAnalyticsExcludedPath(null)).toBe(false);
  });
});
