'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandList } from '@/features/command-editor/CommandList';
import { LandscapeGuard } from '@/components/LandscapeGuard';

export default function HomePage() {
  const { commands, removeCommand } = useCommandStore();
  const router = useRouter();

  return (
    <LandscapeGuard>
      <main>
        <header>
          <h1>コマンド練習</h1>
          <Link href="/commands/new">コマンドを登録する</Link>
        </header>
        {commands.length === 0 ? (
          <div>
            <p>コマンドが登録されていません</p>
            <Link href="/commands/new">コマンドを登録する</Link>
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
