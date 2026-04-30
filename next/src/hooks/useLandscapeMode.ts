'use client';

import { useState, useEffect } from 'react';

export interface UseLandscapeModeReturn {
  /** 現在横画面なら true、縦画面なら false、SSR/hydration 前は null */
  isLandscape: boolean | null;
}

export function useLandscapeMode(): UseLandscapeModeReturn {
  const [isLandscape, setIsLandscape] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    setIsLandscape(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return { isLandscape };
}
