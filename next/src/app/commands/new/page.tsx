'use client';

import { useRouter } from 'next/navigation';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandForm } from '@/features/command-editor/CommandForm';

export default function CommandNewPage() {
  const { addCommand } = useCommandStore();
  const router = useRouter();

  return (
    <main>
      <h1>コマンドを登録する</h1>
      <CommandForm
        onAdd={addCommand}
        onSuccess={() => router.push('/')}
      />
    </main>
  );
}
