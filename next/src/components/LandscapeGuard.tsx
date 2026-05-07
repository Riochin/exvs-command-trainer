'use client';

import { useLandscapeMode } from '@/hooks/useLandscapeMode';
import styles from './LandscapeGuard.module.css';

export interface LandscapeGuardProps {
  children: React.ReactNode;
}

export function LandscapeGuard({ children }: LandscapeGuardProps) {
  const { isLandscape } = useLandscapeMode();

  if (isLandscape === false) {
    return (
      <div role="alert" className={styles.warning}>
        <span data-testid="rotate-icon" aria-hidden="true" className={styles.icon}>
          ↻
        </span>
        <p className={styles.message}>デバイスを横向きにしてください</p>
      </div>
    );
  }

  return <>{children}</>;
}
