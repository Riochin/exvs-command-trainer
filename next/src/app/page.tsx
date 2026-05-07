'use client';

import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandList } from '@/features/command-editor/CommandList';
import { LandscapeGuard } from '@/components/LandscapeGuard';
import { CapsuleButton } from '@/components/CapsuleButton';

export default function HomePage() {
  const { commands, removeCommand } = useCommandStore();
  const router = useRouter();

  return (
    <LandscapeGuard>
      <main>
        <header>
          <h1>EXVS2 コマンド練習アプリ</h1>
          <CapsuleButton href="/commands/new">コマンドを登録する</CapsuleButton>
        </header>
        {commands.length === 0 ? (
          <div>
            <p>コマンドが登録されていません</p>
            <CapsuleButton href="/commands/new">コマンドを登録する</CapsuleButton>
          </div>
        ) : (
          <CommandList
            commands={commands}
            onDelete={(id) => removeCommand(id)}
            onSelect={(id) => router.push(`/commands/${id}`)}
          />
        )}
      </main>
    </LandscapeGuard>
  );
}
