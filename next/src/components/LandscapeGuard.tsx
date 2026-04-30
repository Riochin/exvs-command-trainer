'use client';

import { useLandscapeMode } from '@/hooks/useLandscapeMode';

export interface LandscapeGuardProps {
  children: React.ReactNode;
}

export function LandscapeGuard({ children }: LandscapeGuardProps) {
  const { isLandscape } = useLandscapeMode();

  if (isLandscape === false) {
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100svh',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <span
          data-testid="rotate-icon"
          aria-hidden="true"
          style={{ fontSize: '3rem' }}
        >
          ↻
        </span>
        <p>デバイスを横向きにしてください</p>
      </div>
    );
  }

  return <>{children}</>;
}
