'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAnalytics } from './useAnalytics';
import { isAnalyticsExcludedPath } from './excludedPaths';

export function AnalyticsPageViewTracker() {
  const pathname = usePathname();
  const { trackPageView } = useAnalytics();

  useEffect(() => {
    if (isAnalyticsExcludedPath(pathname)) return;
    trackPageView(pathname);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
