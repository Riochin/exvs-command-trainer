'use client';

/**
 * 3D ビュー（PC 側画面）。
 *
 * スマホの練習画面から届いた入力（またはキーボード）で 3D の機体を動かす。画面は 3D と HUD だけにし、
 * 接続・機体・遅延・ログ・技表は小さな帯から開く設定画面にまとめる。
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArcadeController,
  type ArcadePhysicalButton,
  type ArcadeRawInput,
} from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';
import { inputLabel, phaseLabel } from './inputLabels';
import { summarize, type LatencySummary } from './latencyStats';
import { useRelayHost, type RelayLogEntry } from './useRelayHost';
import { applyInput, applyRawInput, createWorld, ENEMY_FIRE_INTERVAL_S, setLever } from './sim/step';
import { exposeSimForDebug } from './sim/debug';
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

/** PC の WASD と十字キーをレバー代わりにする */
const KEY_TO_LEVER: Readonly<Record<string, LeverDirection>> = {
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'forward',
  s: 'back',
  a: 'left',
  d: 'right',
};

/** スマホなしで操作するときのボタン（右手）。左手の WASD と同時に押しやすい配置 */
const KEYBOARD_KEYS: Readonly<Record<string, ArcadePhysicalButton>> = {
  j: 'shot',
  o: 'melee',
  '[': 'jump',
};

export function InputRelayHostApp({ lanOrigins }: InputRelayHostAppProps) {
  const worldRef = useRef<SimWorld>(createWorld({ enemyFires: true }));
  const [enemyFires, setEnemyFires] = useState(true);
  // 敵が左右に動くとカメラも回り込む。落ち着いて練習したいときは止められる
  const [enemyMoves, setEnemyMoves] = useState(true);
  const [unitId, setUnitId] = useState(GENERIC_UNIT.id);
  // 開いたときは機体選択から始める
  const [selecting, setSelecting] = useState(true);
  const selectUnit = useCallback(
    (id: string) => {
      worldRef.current = createWorld({ enemyFires, enemyMoves, unitId: id });
      setUnitId(id);
      setSelecting(false);
    },
    [enemyFires, enemyMoves],
  );
  const closeSelect = useCallback(() => setSelecting(false), []);
  // 開発中は、ブラウザのコンソールから sim の状態を読めるようにする（window.__inputRelay）
  useEffect(() => exposeSimForDebug(() => worldRef.current), []);
  // キーボードだけで練習するときは接続案内を閉じられる
  const [guideHidden, setGuideHidden] = useState(false);
  // 3D と HUD 以外（接続・機体・遅延・ログ・技表など）は設定画面にまとめる
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);
  // スマホから開く URL。開発中は LAN の IP、本番はこのサイトそのもの（サーバー描画では分からないので null）
  const browserOrigin = useSyncExternalStore(noopSubscribe, readOrigin, readServerOrigin);
  const siteOrigin = lanOrigins[0] ?? browserOrigin;
  const toggleEnemyFire = useCallback(() => {
    const next = !enemyFires;
    worldRef.current.enemy.fireInterval = next ? ENEMY_FIRE_INTERVAL_S : 0;
    setEnemyFires(next);
  }, [enemyFires]);
  const toggleEnemyMoves = useCallback(() => {
    const next = !enemyMoves;
    worldRef.current.enemy.moves = next;
    setEnemyMoves(next);
  }, [enemyMoves]);
  const handleInput = useCallback((message: RelayInputMessage) => {
    if (message.type === 'button') applyInput(worldRef.current, message.button);
    else applyRawInput(worldRef.current, message);
  }, []);
  const host = useRelayHost({ onInput: handleInput });
  // スマホなしでもキーボード（J/O/[）で動かせるようにする。判定はアケコンと同じものを使う
  const handleKeyboardInput = useCallback((button: ButtonType) => {
    applyInput(worldRef.current, button);
  }, []);
  const handleKeyboardRaw = useCallback((input: ArcadeRawInput) => {
    applyRawInput(worldRef.current, input);
  }, []);

  useEffect(() => {
    const onKey = (pressed: boolean) => (e: KeyboardEvent) => {
      const direction = KEY_TO_LEVER[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (direction === undefined) return;
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
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
  const unit = unitById(unitId);

  const connectSteps = (
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
  );

  return (
    <div className={styles.app}>
      {/* キーボード操作の判定だけを借りる。ボタン自体は表示しない */}
      <div className={styles.hiddenController} aria-hidden="true">
        <ArcadeController onButtonPress={handleKeyboardInput} onRawInput={handleKeyboardRaw} keyboardKeys={KEYBOARD_KEYS} />
      </div>

      <div className={styles.stage}>
        <MechViewer worldRef={worldRef} unitId={unitId} />
        <MechHud worldRef={worldRef} />

        {/* 3D と HUD 以外は、この小さな帯と設定画面にまとめる */}
        <div className={styles.toolbar}>
          <span className={styles.connDot} data-state={host.connection} aria-hidden="true" />
          <span className={styles.toolbarRoom} data-testid="relay-room">
            {host.room ?? '----'}
          </span>
          <span className={styles.toolbarStatus}>{CONNECTION_LABELS[host.connection]}</span>
          <button type="button" className={styles.toolbarButton} onClick={() => setSelecting(true)}>
            機体
          </button>
          <button type="button" className={styles.toolbarButton} onClick={() => setSettingsOpen(true)}>
            設定
          </button>
        </div>

        {host.connection !== 'connected' && !guideHidden && !settingsOpen && !selecting && (
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
              {connectSteps}
              <p className={styles.note}>スマホなしでも、キーボード（WASD／十字キーと J・O・[）で操作できます</p>
            </div>
          </section>
        )}
      </div>

      {settingsOpen && (
        <div className={styles.modalOverlay} onClick={() => setSettingsOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="relay-settings-title"
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 id="relay-settings-title" className={styles.modalTitle}>
                設定
              </h2>
              <button type="button" className={styles.restart} onClick={() => setSettingsOpen(false)}>
                閉じる（Esc）
              </button>
            </div>

            <div className={styles.modalGrid}>
              <section aria-label="スマホとの接続" className={styles.modalSection}>
                <h3 className={styles.heading}>スマホとの接続</h3>
                <div className={styles.connectRow}>
                  <JoinQrCode origin={siteOrigin} room={host.room} />
                  <div className={styles.connectBody}>
                    <div className={styles.roomInline}>
                      <span className={styles.caption}>ROOM</span>
                      <span className={styles.roomSmall}>{host.room ?? '----'}</span>
                    </div>
                    <p className={styles.status} data-state={host.connection}>
                      {CONNECTION_LABELS[host.connection]}
                      {host.error && <span className={styles.error}>：{host.error}</span>}
                    </p>
                    <div className={styles.buttonRow}>
                      <button type="button" className={styles.restart} onClick={host.restart}>
                        ルームを作り直す
                      </button>
                      {guideHidden && (
                        <button type="button" className={styles.restart} onClick={() => setGuideHidden(false)}>
                          接続案内を表示する
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {connectSteps}
              </section>

              <section aria-label="機体と練習" className={styles.modalSection}>
                <h3 className={styles.heading}>機体と練習</h3>
                <div className={styles.buttonRow}>
                  <button type="button" className={styles.unitButton} onClick={() => setSelecting(true)}>
                    機体: {unit.name}
                  </button>
                  <button type="button" className={styles.restart} onClick={toggleEnemyFire} aria-pressed={enemyFires}>
                    敵の射撃: {enemyFires ? 'ON' : 'OFF'}
                  </button>
                  <button type="button" className={styles.restart} onClick={toggleEnemyMoves} aria-pressed={enemyMoves}>
                    敵の移動: {enemyMoves ? 'ON' : 'OFF'}
                  </button>
                </div>
                <h4 className={styles.subHeading}>キーボード操作</h4>
                <dl className={styles.keyList}>
                  <dt>W A S D ／ 十字キー</dt>
                  <dd>移動（同じ方向に 2 回でステップ）</dd>
                  <dt>J</dt>
                  <dd>射撃（長押しで射CS）</dd>
                  <dt>O</dt>
                  <dd>格闘（長押しで格CS）</dd>
                  <dt>[</dt>
                  <dd>ジャンプ（長押しで上昇、2 回で BD）</dd>
                  <dt>J＋O ／ J＋[ ／ O＋[</dt>
                  <dd>サブ ／ 特射 ／ 特格</dd>
                </dl>
                <h4 className={styles.subHeading}>技表</h4>
                <CommandList unit={unit} />
              </section>

              <section aria-label="遅延と入力ログ" className={styles.modalSection}>
                <h3 className={styles.heading}>遅延（ms）</h3>
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
                <h4 className={styles.subHeading}>入力ログ</h4>
                {host.log.length === 0 ? (
                  <p className={styles.empty}>スマホから入力が届くとここに出ます</p>
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
            </div>
          </div>
        </div>
      )}
      {selecting && <UnitSelect currentId={unitId} onSelect={selectUnit} onClose={closeSelect} />}
    </div>
  );
}
