'use client';

import { useEffect } from 'react';
import { FreePlayForm } from '@/features/command-editor/FreePlayForm';
import { LandscapeGuard } from '@/components/LandscapeGuard';
import { useAnalytics } from '@/features/analytics/useAnalytics';

export default function FreePlayPage() {
  const { trackEvent } = useAnalytics();

  useEffect(() => {
    trackEvent('free_play_used');
    // マウント時1回だけ記録
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LandscapeGuard>
      <FreePlayForm />
    </LandscapeGuard>
  );
}
