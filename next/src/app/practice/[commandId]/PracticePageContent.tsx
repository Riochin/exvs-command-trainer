'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { PracticeSetup } from '@/features/practice/PracticeSetup';
import { PracticeSession } from '@/features/practice/PracticeSession';
import { LandscapeGuard } from '@/components/LandscapeGuard';

export function PracticePageContent({ commandId }: { commandId: string }) {
  const { getCommand } = useCommandStore();
  const router = useRouter();
  const command = getCommand(commandId);

  const [phase, setPhase] = useState<'setup' | 'practicing'>('setup');
  const [timeLimit, setTimeLimit] = useState<number | null>(30);

  if (!command) {
    return (
      <div>
        <p>コマンドが見つかりません</p>
        <Link href="/">コマンド一覧に戻る</Link>
      </div>
    );
  }

  const handleStart = (limit: number | null) => {
    setTimeLimit(limit);
    setPhase('practicing');
  };

  const handleExit = () => {
    router.push(`/commands/${commandId}`);
  };

  return (
    <LandscapeGuard>
      {phase === 'setup' ? (
        <PracticeSetup
          command={command}
          onStart={handleStart}
          onBack={handleExit}
        />
      ) : (
        <PracticeSession
          command={command}
          onExit={handleExit}
          timeLimit={timeLimit}
        />
      )}
    </LandscapeGuard>
  );
}
