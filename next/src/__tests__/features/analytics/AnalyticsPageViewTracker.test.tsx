import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsPageViewTracker } from '@/features/analytics/AnalyticsPageViewTracker';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

const trackPageView = vi.fn();
vi.mock('@/features/analytics/useAnalytics', () => ({
  useAnalytics: () => ({
    trackSessionStart: vi.fn(),
    trackAttempt: vi.fn(),
    trackSessionEnd: vi.fn(),
    trackPageView,
    trackEvent: vi.fn(),
  }),
}));

import { usePathname } from 'next/navigation';

const mockUsePathname = vi.mocked(usePathname);

describe('AnalyticsPageViewTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('通常のページではページビューを送信する', () => {
    mockUsePathname.mockReturnValue('/commands');

    render(<AnalyticsPageViewTracker />);

    expect(trackPageView).toHaveBeenCalledWith('/commands');
  });

  it('除外パスではページビューを送信しない', () => {
    mockUsePathname.mockReturnValue('/tools/chart-author');

    render(<AnalyticsPageViewTracker />);

    expect(trackPageView).not.toHaveBeenCalled();
  });

  it('pathname が null でも送信を試みる', () => {
    mockUsePathname.mockReturnValue(null as unknown as string);

    render(<AnalyticsPageViewTracker />);

    expect(trackPageView).toHaveBeenCalledTimes(1);
  });
});
