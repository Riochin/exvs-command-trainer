'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Command } from '@/types';

export interface CommandListProps {
  commands: Command[];
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
}

export function CommandList({ commands, onDelete, onSelect }: CommandListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (commands.length === 0) {
    return <p>登録されたコマンドはありません</p>;
  }

  const groups = commands.reduce<Record<string, Command[]>>((acc, cmd) => {
    if (!acc[cmd.mobileSuit]) acc[cmd.mobileSuit] = [];
    acc[cmd.mobileSuit].push(cmd);
    return acc;
  }, {});

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
  };

  const handleConfirm = () => {
    if (deletingId) {
      onDelete(deletingId);
      setDeletingId(null);
    }
  };

  const handleCancel = () => {
    setDeletingId(null);
  };

  const deletingCommand = commands.find((c) => c.id === deletingId);

  return (
    <>
      {Object.entries(groups).map(([mobileSuit, cmds]) => (
        <div key={mobileSuit} role="group" aria-label={mobileSuit}>
          <h2>{mobileSuit}</h2>
          <ul>
            {cmds.map((cmd) => (
              <li key={cmd.id}>
                {onSelect ? (
                  <button type="button" onClick={() => onSelect(cmd.id)}>{cmd.name}</button>
                ) : (
                  <span>{cmd.name}</span>
                )}
                <button type="button" aria-label={`${cmd.name}を削除`} onClick={() => handleDeleteClick(cmd.id)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ConfirmDialog
        open={deletingId !== null}
        message={deletingCommand ? `「${deletingCommand.name}」を削除しますか？` : '削除しますか？'}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
