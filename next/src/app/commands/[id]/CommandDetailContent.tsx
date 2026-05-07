'use client';

import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandDetail } from '@/features/command-editor/CommandDetail';
import { PracticeHistory } from '@/features/practice-history/PracticeHistory';
import { CapsuleButton } from '@/components/CapsuleButton';
import styles from './CommandDetailContent.module.css';

export function CommandDetailContent({ commandId }: { commandId: string }) {
  const { getCommand } = useCommandStore();
  const router = useRouter();
  const command = getCommand(commandId);

  if (!command) {
    return <p>コマンドが見つかりません</p>;
  }

  return (
    <main className={styles.main}>
      <CommandDetail command={command} />
      <PracticeHistory commandId={commandId} commandName={command.name} />
      <CapsuleButton onClick={() => router.push(`/practice/${commandId}`)}>
        練習を開始する
      </CapsuleButton>
    </main>
  );
}
