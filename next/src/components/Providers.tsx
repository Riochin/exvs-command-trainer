'use client';

import { SessionProvider } from 'next-auth/react';
import { RelayProvider } from '@/features/input-relay/RelayProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <RelayProvider>{children}</RelayProvider>
    </SessionProvider>
  );
}
