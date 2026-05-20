'use client';

import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandForm } from '@/features/command-editor/CommandForm';
import { useAnalytics } from '@/features/analytics/useAnalytics';
import type { Command } from '@/types';
import type { StorageResult } from '@/types';
import styles from './page.module.css';

export default function CommandNewPage() {
  const { addCommand } = useCommandStore();
  const router = useRouter();
  const { trackEvent } = useAnalytics();

  const handleAdd = (input: Omit<Command, 'id' | 'createdAt'>): StorageResult<Command> => {
    const result = addCommand(input);
    if (result.ok) {
      trackEvent('command_created', {
        mobileSuit: input.mobileSuit,
        stepCount: input.sequence.length,
      });
    }
    return result;
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>コマンドを登録する</h1>
      <CommandForm
        onAdd={handleAdd}
        onSuccess={() => router.push('/')}
      />
    </main>
  );
}
