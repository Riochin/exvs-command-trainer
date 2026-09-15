'use client';

/**
 * 再解析のときに必ず通る 3 択。
 *
 * 共有の ConfirmDialog は 2 択かつ文言が固定で、ここで必要な
 * 「自動検出のみ差し替え / 全ステップ破棄 / 取りやめ」を表せない。
 * 手動で置いたステップを黙って消さない（Req 5.4）ための関門なので、
 * 2 択へ丸めずフィーチャー内の専用ダイアログとして持つ。
 */
import { useEffect } from 'react';
import type { RerunStrategy } from '../types';
import styles from './RerunDecisionDialog.module.css';

export type RerunDecisionDialogProps = {
  readonly open: boolean;
  /** 破棄の重さを判断できるよう、失われる手動ステップの件数を示す */
  readonly manualStepCount: number;
  onDecide(strategy: RerunStrategy): void;
  onCancel(): void;
};

export function RerunDecisionDialog({
  open,
  manualStepCount,
  onDecide,
  onCancel,
}: RerunDecisionDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      // 取りやめが既定の結末。迷って閉じたときに何も失われないようにする
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="再解析の方針"
        className={styles.dialog}
      >
        <p className={styles.message}>
          再解析すると自動検出のステップが作り直されます。
        </p>
        <p className={styles.detail} data-testid="rerun-manual-count">
          手動で加えたステップは {manualStepCount} 件です。
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onDecide('replace_auto_only')}
          >
            自動検出のみ差し替え
          </button>
          <button
            type="button"
            className={styles.destructive}
            onClick={() => onDecide('discard_all')}
          >
            全ステップ破棄
          </button>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            取りやめ
          </button>
        </div>
      </div>
    </div>
  );
}
