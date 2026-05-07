'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Command } from '@/types';
import styles from './CommandList.module.css';

export interface CommandListProps {
  commands: Command[];
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
}

export function CommandList({ commands, onDelete, onSelect }: CommandListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (commands.length === 0) {
    return <p className={styles.emptyMessage}>登録されたコマンドはありません</p>;
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
        <div key={mobileSuit} role="group" aria-label={mobileSuit} className={styles.group}>
          <h2 className={styles.groupTitle}>{mobileSuit}</h2>
          <ul className={styles.list}>
            {cmds.map((cmd) => (
              <li key={cmd.id} className={styles.item}>
                {onSelect ? (
                  <button type="button" className={styles.itemButton} onClick={() => onSelect(cmd.id)}>{cmd.name}</button>
                ) : (
                  <span className={styles.itemName}>{cmd.name}</span>
                )}
                <button type="button" className={styles.deleteButton} aria-label={`${cmd.name}を削除`} onClick={() => handleDeleteClick(cmd.id)}>
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
