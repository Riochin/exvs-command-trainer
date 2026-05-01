'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { PracticeSession } from '@/features/practice/PracticeSession';
import { LandscapeGuard } from '@/components/LandscapeGuard';

export function PracticePageContent({ commandId }: { commandId: string }) {
  const { getCommand } = useCommandStore();
  const router = useRouter();
  const command = getCommand(commandId);

  if (!command) {
    return (
      <div>
        <p>コマンドが見つかりません</p>
        <Link href="/">コマンド一覧に戻る</Link>
      </div>
    );
  }

  return (
    <LandscapeGuard>
      <PracticeSession
        command={command}
        onExit={() => router.push(`/commands/${commandId}`)}
      />
    </LandscapeGuard>
  );
}
