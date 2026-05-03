'use client';

import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandForm } from '@/features/command-editor/CommandForm';
import styles from './page.module.css';

export default function CommandNewPage() {
  const { addCommand } = useCommandStore();
  const router = useRouter();

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>コマンドを登録する</h1>
      <CommandForm
        onAdd={addCommand}
        onSuccess={() => router.push('/')}
      />
    </main>
  );
}
