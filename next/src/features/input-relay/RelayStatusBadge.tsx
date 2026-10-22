import type { RelayConnectionState } from './types';
import styles from './RelayStatusBadge.module.css';

const LABELS: Readonly<Record<RelayConnectionState, string>> = {
  idle: 'RELAY OFF',
  waiting: 'RELAY 待機',
  connecting: 'RELAY 接続中',
  connected: 'RELAY ON',
  disconnected: 'RELAY 切断',
  error: 'RELAY ERR',
};

/** 練習画面で入力リレーの接続状態を小さく示す */
export function RelayStatusBadge({ room, connection }: { room: string; connection: RelayConnectionState }) {
  return (
    <div data-testid="relay-status" className={styles.badge} data-state={connection} title={`ROOM ${room}`}>
      {LABELS[connection]}
    </div>
  );
}
