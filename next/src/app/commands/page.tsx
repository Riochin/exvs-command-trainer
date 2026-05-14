'use client';

import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandList } from '@/features/command-editor/CommandList';
import { LandscapeGuard } from '@/components/LandscapeGuard';
import { CapsuleButton } from '@/components/CapsuleButton';
import styles from './page.module.css';

export default function CommandsPage() {
  const { commands, removeCommand } = useCommandStore();
  const router = useRouter();

  return (
    <LandscapeGuard>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>EXVSコマンド道場</h1>
          <CapsuleButton href="/commands/new">コマンドを登録する</CapsuleButton>
        </header>
        {commands.length === 0 ? (
          <div className={styles.emptyState}>
            <p>コマンドが登録されていません</p>
            <CapsuleButton href="/commands/new">コマンドを登録する</CapsuleButton>
          </div>
        ) : (
          <div className={styles.listArea}>
            <CommandList
              commands={commands}
              onDelete={(id) => removeCommand(id)}
              onSelect={(id) => router.push(`/commands/${id}`)}
            />
          </div>
        )}
      </main>
    </LandscapeGuard>
  );
}
