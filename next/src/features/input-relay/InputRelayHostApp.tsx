'use client';

/**
 * 入力リレー試作の PC 側画面。
 *
 * スマホの練習画面から届いた入力で 3D の機体を動かす。脇には遅延の集計と入力ログを出す。
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArcadeController, type ArcadeRawInput } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';
import { inputLabel, phaseLabel } from './inputLabels';
import { summarize, type LatencySummary } from './latencyStats';
import { useRelayHost, type RelayLogEntry } from './useRelayHost';
import { applyInput, applyRawInput, createWorld, ENEMY_FIRE_INTERVAL_S, setLever } from './sim/step';
import type { LeverDirection, SimWorld } from './sim/types';
import type { RelayConnectionState, RelayInputMessage } from './types';
import { GENERIC_UNIT, unitById } from './sim/units';
import { CommandList, UnitSelect } from './UnitSelect';
import { JoinQrCode } from './JoinQrCode';
import { MechHud } from './viewer/MechHud';
import styles from './InputRelayHostApp.module.css';

// three は window を前提にするので、サーバーでは描画しない
const MechViewer = dynamic(() => import('./viewer/MechViewer').then((m) => m.MechViewer), { ssr: false });

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

const noopSubscribe = () => () => {};
const readOrigin = () => window.location.origin;
const readServerOrigin = () => null;

/** PC の十字キーをレバー代わりにする */
const ARROW_TO_LEVER: Readonly<Record<string, LeverDirection>> = {
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function InputRelayHostApp({ lanOrigins }: InputRelayHostAppProps) {
  const worldRef = useRef<SimWorld>(createWorld({ enemyFires: true }));
  const [enemyFires, setEnemyFires] = useState(true);
  const [unitId, setUnitId] = useState(GENERIC_UNIT.id);
  // 開いたときは機体選択から始める
  const [selecting, setSelecting] = useState(true);
  const selectUnit = useCallback(
    (id: string) => {
      worldRef.current = createWorld({ enemyFires, unitId: id });
      setUnitId(id);
      setSelecting(false);
    },
    [enemyFires],
  );
  const closeSelect = useCallback(() => setSelecting(false), []);
  // キーボードだけで練習するときは接続案内を閉じられる
  const [guideHidden, setGuideHidden] = useState(false);
  // スマホから開く URL。開発中は LAN の IP、本番はこのサイトそのもの（サーバー描画では分からないので null）
  const browserOrigin = useSyncExternalStore(noopSubscribe, readOrigin, readServerOrigin);
  const siteOrigin = lanOrigins[0] ?? browserOrigin;
  const toggleEnemyFire = useCallback(() => {
    const next = !enemyFires;
    worldRef.current.enemy.fireInterval = next ? ENEMY_FIRE_INTERVAL_S : 0;
    setEnemyFires(next);
  }, [enemyFires]);
  const handleInput = useCallback((message: RelayInputMessage) => {
    if (message.type === 'button') applyInput(worldRef.current, message.button);
    else applyRawInput(worldRef.current, message);
  }, []);
  const host = useRelayHost({ onInput: handleInput });
  // PC のキーボード（F/Y/I）でも動かせるようにする。判定はアケコンと同じものを使う
  const handleKeyboardInput = useCallback((button: ButtonType) => {
    applyInput(worldRef.current, button);
  }, []);
  const handleKeyboardRaw = useCallback((input: ArcadeRawInput) => {
    applyRawInput(worldRef.current, input);
  }, []);

  useEffect(() => {
    const onKey = (pressed: boolean) => (e: KeyboardEvent) => {
      const direction = ARROW_TO_LEVER[e.key];
      if (direction === undefined) return;
      e.preventDefault();
      if (pressed && e.repeat) return;
      setLever(worldRef.current, direction, pressed);
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
  const rtt = summarize(host.rttMs);
  const latency = summarize(host.latencyMs);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>3D VIEW</h1>
        <div className={styles.roomInline}>
          <span className={styles.caption}>ROOM</span>
          <span className={styles.roomSmall} data-testid="relay-room">
            {host.room ?? '----'}
          </span>
        </div>
        <p className={styles.status} data-state={host.connection}>
          {CONNECTION_LABELS[host.connection]}
        </p>
        <button type="button" className={styles.restart} onClick={host.restart}>
          ルームを作り直す
        </button>
        <button type="button" className={styles.unitButton} onClick={() => setSelecting(true)}>
          機体: {unitById(unitId).name}
        </button>
        <button type="button" className={styles.restart} onClick={toggleEnemyFire} aria-pressed={enemyFires}>
          敵の射撃: {enemyFires ? 'ON' : 'OFF'}
        </button>
        <p className={styles.keys}>PC のキーボードでも操作できます: F 射撃 / Y 格闘 / I ジャンプ（長押しで上昇） / 十字キー 移動（2 回倒してステップ）</p>
      </header>
      {/* キーボード操作の判定だけを借りる。ボタン自体は表示しない */}
      <div className={styles.hiddenController} aria-hidden="true">
        <ArcadeController onButtonPress={handleKeyboardInput} onRawInput={handleKeyboardRaw} />
      </div>

      <div className={styles.main}>
        <div className={styles.stage}>
          <MechViewer worldRef={worldRef} unitId={unitId} />
          <MechHud worldRef={worldRef} />
          {host.connection !== 'connected' && !guideHidden && (
            <section className={styles.connect} aria-label="接続">
              <button type="button" className={styles.guideClose} onClick={() => setGuideHidden(true)} aria-label="接続案内を閉じる">
                ×
              </button>
              <JoinQrCode origin={siteOrigin} room={host.room} />
              <div className={styles.roomBlock}>
                <span className={styles.caption}>ROOM</span>
                <span className={styles.room}>{host.room ?? '----'}</span>
              </div>
              <div className={styles.connectBody}>
                <p className={styles.status} data-state={host.connection}>
                  {CONNECTION_LABELS[host.connection]}
                  {host.error && <span className={styles.error}>：{host.error}</span>}
                </p>
                <ol className={styles.steps}>
                  <li>スマホのカメラで QR コードを読み取る。フリー練習が開いて、そのままつながる</li>
                  <li>
                    または、スマホで{' '}
                    {lanOrigins.length > 0 ? (
                      lanOrigins.map((origin) => (
                        <code key={origin} className={styles.code}>
                          {origin}
                        </code>
                      ))
                    ) : (
                      <span>このサイト</span>
                    )}{' '}
                    を開き、練習画面上部の <span className={styles.chip}>PC連携</span> でコード{' '}
                    <code className={styles.code}>{host.room ?? '----'}</code> を入力
                  </li>
                  <li>つないだあとは、フリー練習とコマンド練習を行き来しても、再読み込みしてもつながったまま</li>
                </ol>
              </div>
            </section>
          )}
        </div>

        <aside className={styles.side}>
          <details className={styles.commandsSection} open>
            <summary className={styles.heading}>技表</summary>
            <CommandList unit={unitById(unitId)} />
          </details>
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
                <StatRow label="往復" summary={rtt} />
                <StatRow label="片道" summary={latency} />
              </tbody>
            </table>
            <p className={styles.note}>取りこぼし: {host.lostCount} 件</p>
          </section>

          <section aria-label="入力ログ" className={styles.logSection}>
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
                      {entry.latencyMs === null ? '—' : `${formatMs(entry.latencyMs)}`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
      {selecting && <UnitSelect currentId={unitId} onSelect={selectUnit} onClose={closeSelect} />}
    </div>
  );
}
