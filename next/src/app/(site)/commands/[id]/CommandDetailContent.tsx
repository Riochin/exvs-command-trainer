'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandDetail } from '@/features/command-editor/CommandDetail';
import { PracticeHistory } from '@/features/practice-history/PracticeHistory';
import { CapsuleButton } from '@/components/CapsuleButton';
import styles from './CommandDetailContent.module.css';

const TIME_LIMIT = 30;

export function CommandDetailContent({ commandId }: { commandId: string }) {
  const { getCommand } = useCommandStore();
  const router = useRouter();
  const command = getCommand(commandId);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true);

  if (!command) {
    return <p>コマンドが見つかりません</p>;
  }

  const handleStart = () => {
    const query = timeLimitEnabled ? `?timeLimit=${TIME_LIMIT}` : '';
    router.push(`/practice/${commandId}${query}`);
  };

  return (
    <main className={styles.main}>
      <div className={styles.left}>
        <CommandDetail command={command} />
      </div>
      <div className={styles.right}>
        <PracticeHistory commandId={commandId} commandName={command.name} />
        <div className={styles.startArea}>
          <div className={styles.timeLimitRow}>
            <span className={styles.timeLimitLabel}>時間制限</span>
            <div className={styles.toggle} role="group" aria-label="時間制限設定">
              <button
                type="button"
                className={`${styles.toggleOption} ${timeLimitEnabled ? styles.toggleOptionActive : ''}`}
                onClick={() => setTimeLimitEnabled(true)}
                aria-pressed={timeLimitEnabled}
              >
                {TIME_LIMIT}秒
              </button>
              <button
                type="button"
                className={`${styles.toggleOption} ${!timeLimitEnabled ? styles.toggleOptionActive : ''}`}
                onClick={() => setTimeLimitEnabled(false)}
                aria-pressed={!timeLimitEnabled}
              >
                なし
              </button>
            </div>
          </div>
          <CapsuleButton onClick={handleStart}>練習を開始する</CapsuleButton>
        </div>
      </div>
    </main>
  );
}
