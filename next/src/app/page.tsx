'use client';

import { FreePlayForm } from '@/features/command-editor/FreePlayForm';
import { LandscapeGuard } from '@/components/LandscapeGuard';

export default function FreePlayPage() {
  return (
    <LandscapeGuard>
      <FreePlayForm />
    </LandscapeGuard>
  );
}
