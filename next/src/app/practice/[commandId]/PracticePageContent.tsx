'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { PracticeSession } from '@/features/practice/PracticeSession';
import { LandscapeGuard } from '@/components/LandscapeGuard';
import { useRelayRoomParam } from '@/features/input-relay/useRelayRoomParam';

export function PracticePageContent({
  commandId,
  timeLimit,
  relayRoom = null,
}: {
  commandId: string;
  timeLimit: number | null;
  relayRoom?: string | null;
}) {
  const { getCommand } = useCommandStore();
  const router = useRouter();
  const setRelayRoom = useRelayRoomParam();
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
        timeLimit={timeLimit}
        relayRoom={relayRoom}
        onRelayRoomChange={setRelayRoom}
      />
    </LandscapeGuard>
  );
}
