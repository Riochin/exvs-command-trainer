'use client';

import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div role="dialog" aria-modal="true" className={styles.dialog}>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.confirmButton} onClick={onConfirm}>
            削除する
          </button>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
