'use client';

export interface ConfirmDialogProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true">
      <p>{message}</p>
      <button type="button" onClick={onConfirm}>
        削除する
      </button>
      <button type="button" onClick={onCancel}>
        キャンセル
      </button>
    </div>
  );
}
