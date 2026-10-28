'use client';

/**
 * 練習画面に置く入力リレー（試作）の入口。
 *
 * 普段は小さな「PC連携」表示だけを出し、押すと PC 側に出ているルームコードを入力する
 * ダイアログを開く。つないだ後は同じ場所が接続状態の表示になり、押すと切断・つなぎ直しができる。
 */
import { useState } from 'react';
import { CapsuleButton } from '@/components/CapsuleButton';
import { isRoomCode, ROOM_CODE_LENGTH } from './protocol';
import type { RelayConnectionState } from './types';
import styles from './RelayControl.module.css';

const BADGE_LABELS: Readonly<Record<RelayConnectionState, string>> = {
  idle: 'PC連携',
  waiting: 'PC 待機',
  connecting: 'PC 接続中',
  connected: 'PC 接続済',
  disconnected: 'PC 切断',
  error: 'PC エラー',
};

const STATUS_MESSAGES: Readonly<Record<RelayConnectionState, string>> = {
  idle: '未接続',
  waiting: 'PC 側のルームを探しています',
  connecting: 'PC と接続しています',
  connected: '接続済み。入力が PC に送られています',
  disconnected: '切断されました。つなぎ直してください',
  error: '接続できませんでした',
};

export type RelayControlProps = {
  room: string | null;
  connection: RelayConnectionState;
  error: string | null;
  onRoomChange: (room: string | null) => void;
};

/** 入力を大文字にし、コードに使わない文字を落とす */
function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function RelayControl({ room, connection, error, onRoomChange }: RelayControlProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(room ?? '');
  const valid = isRoomCode(code);

  const openDialog = () => {
    setCode(room ?? '');
    setOpen(true);
  };

  const connect = () => {
    if (!valid) return;
    onRoomChange(code);
    setOpen(false);
  };

  const disconnect = () => {
    onRoomChange(null);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        data-testid="relay-status"
        className={styles.badge}
        data-state={connection}
        onClick={openDialog}
        aria-haspopup="dialog"
      >
        {BADGE_LABELS[connection]}
      </button>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="relay-dialog-title"
            className={styles.dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="relay-dialog-title" className={styles.title}>
              PC連携
            </h2>
            <p className={styles.help}>
              PC でメニューの「3Dビュー（PC）」を開き、表示されている {ROOM_CODE_LENGTH} 文字のコードを入力してください（QR コードを読み取ってもつながります）。つないだあとは画面を移ってもつながったままです。
            </p>
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                connect();
              }}
            >
              <input
                className={styles.input}
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                aria-label="ルームコード"
                placeholder="ABCD"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={ROOM_CODE_LENGTH}
                autoFocus
              />
              <CapsuleButton type="submit" size="sm" disabled={!valid}>
                {room !== null && code === room ? 'つなぎ直す' : '接続'}
              </CapsuleButton>
            </form>
            {room !== null && (
              <p className={styles.status} data-state={connection}>
                ROOM {room}：{STATUS_MESSAGES[connection]}
                {error && <span className={styles.error}>（{error}）</span>}
              </p>
            )}
            <div className={styles.actions}>
              {room !== null && (
                <CapsuleButton variant="danger" size="sm" onClick={disconnect}>
                  切断
                </CapsuleButton>
              )}
              <button type="button" className={styles.close} onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
