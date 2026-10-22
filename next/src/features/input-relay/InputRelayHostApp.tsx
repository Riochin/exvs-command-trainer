'use client';

/**
 * 入力リレー試作の PC 側画面。
 *
 * スマホの練習画面から届く入力をログに出し、ping の往復時間と入力ごとの片道遅延を
 * 集計して見せる。3D 描画に進む前に、手元の Wi-Fi で遅延が許容範囲かを測るためのもの。
 */
import { inputLabel, phaseLabel } from './inputLabels';
import { summarize, type LatencySummary } from './latencyStats';
import { useRelayHost, type RelayLogEntry } from './useRelayHost';
import type { RelayConnectionState } from './types';
import styles from './InputRelayHostApp.module.css';

export type InputRelayHostAppProps = {
  /** スマホから開く PC の URL 候補（開発サーバーが LAN IP から求めたもの）。本番では空 */
  readonly lanOrigins: ReadonlyArray<string>;
};

const CONNECTION_LABELS: Readonly<Record<RelayConnectionState, string>> = {
  idle: '準備中',
  waiting: 'スマホの接続待ち',
  connecting: '接続中',
  connected: '接続済み',
  disconnected: '切断',
  error: 'エラー',
};

function formatMs(value: number): string {
  return value.toFixed(1);
}

function StatRow({ label, summary }: { label: string; summary: LatencySummary | null }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {summary === null ? (
        <td colSpan={5} className={styles.empty}>
          まだありません
        </td>
      ) : (
        <>
          <td>{formatMs(summary.latest)}</td>
          <td>{formatMs(summary.mean)}</td>
          <td>{formatMs(summary.p95)}</td>
          <td>{formatMs(summary.max)}</td>
          <td>{summary.count}</td>
        </>
      )}
    </tr>
  );
}

function describeEntry(entry: RelayLogEntry): string {
  const { message } = entry;
  if (message.type === 'raw') return `${inputLabel(message.button)} ${phaseLabel(message.phase)}`;
  return inputLabel(message.button);
}

export function InputRelayHostApp({ lanOrigins }: InputRelayHostAppProps) {
  const host = useRelayHost();
  const rtt = summarize(host.rttMs);
  const latency = summarize(host.latencyMs);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>INPUT RELAY</h1>
        <p className={styles.note}>スマホの練習画面の入力を WebRTC で受けて遅延を測る試作</p>
      </header>

      <div className={styles.scrollRegion}>
        <section className={styles.connect} aria-label="接続">
          <div className={styles.roomBlock}>
            <span className={styles.caption}>ROOM</span>
            <span className={styles.room} data-testid="relay-room">
              {host.room ?? '----'}
            </span>
          </div>
          <div className={styles.connectBody}>
            <p className={styles.status} data-state={host.connection}>
              {CONNECTION_LABELS[host.connection]}
              {host.error && <span className={styles.error}>：{host.error}</span>}
            </p>
            <ol className={styles.steps}>
              <li>
                スマホで{' '}
                {lanOrigins.length > 0 ? (
                  lanOrigins.map((origin) => (
                    <code key={origin} className={styles.code}>
                      {origin}
                    </code>
                  ))
                ) : (
                  <span>このサイト</span>
                )}{' '}
                を開き、フリー練習かコマンドの練習画面に進む
              </li>
              <li>
                画面上部の <span className={styles.chip}>PC連携</span> を押し、コード{' '}
                <code className={styles.code}>{host.room ?? '----'}</code> を入力して「接続」
              </li>
            </ol>
            <button type="button" className={styles.restart} onClick={host.restart}>
              ルームを作り直す
            </button>
          </div>
        </section>

        <section aria-label="遅延">
          <h2 className={styles.heading}>遅延（ms）</h2>
          <table className={styles.stats}>
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">直近</th>
                <th scope="col">平均</th>
                <th scope="col">p95</th>
                <th scope="col">最大</th>
                <th scope="col">件数</th>
              </tr>
            </thead>
            <tbody>
              <StatRow label="往復（ping）" summary={rtt} />
              <StatRow label="片道（入力）" summary={latency} />
            </tbody>
          </table>
          <p className={styles.note}>
            片道は ping で推定した時計のずれで補正した値。取りこぼし: {host.lostCount} 件
          </p>
        </section>

        <section aria-label="入力ログ">
          <h2 className={styles.heading}>入力ログ</h2>
          {host.log.length === 0 ? (
            <p className={styles.empty}>入力が届くとここに出ます</p>
          ) : (
            <ol className={styles.log} data-testid="relay-log">
              {[...host.log].reverse().map((entry) => (
                <li key={entry.message.seq} className={styles.logItem} data-kind={entry.message.type}>
                  <span className={styles.seq}>#{entry.message.seq}</span>
                  <span className={styles.kind}>{entry.message.type === 'raw' ? 'RAW' : 'CMD'}</span>
                  <span className={styles.input}>{describeEntry(entry)}</span>
                  <span className={styles.latency}>
                    {entry.latencyMs === null ? '—' : `${formatMs(entry.latencyMs)} ms`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
