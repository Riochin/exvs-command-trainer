'use client';

/**
 * 3D ビュー（PC 側画面）。
 *
 * スマホの練習画面から届いた入力（またはキーボード）で 3D の機体を動かす。画面は 3D と HUD だけにし、
 * 接続・機体・遅延・ログ・技表は小さな帯から開く設定画面にまとめる。
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArcadeController,
  type ArcadePhysicalButton,
  type ArcadeRawInput,
} from '@/features/arcade-controller/ArcadeController';
import { AuthButton } from '@/components/AuthButton';
import { Toggle } from '@/components/Toggle';
import type { ButtonType } from '@/types';
import { inputLabel, phaseLabel } from './inputLabels';
import { summarize, type LatencySummary } from './latencyStats';
import { useFullscreen } from './useFullscreen';
import { useRelayHost, type RelayLogEntry } from './useRelayHost';
import { applyInput, applyRawInput, createWorld, ENEMY_FIRE_INTERVAL_S, setLever, tapLever } from './sim/step';
import { exposeSimForDebug } from './sim/debug';
import type { LeverDirection, SimWorld } from './sim/types';
import type { RelayConnectionState, RelayInputMessage } from './types';
import { GENERIC_UNIT, unitById } from './sim/units';
import { CommandList, UnitSelect } from './UnitSelect';
import { JoinQrCode } from './JoinQrCode';
import { MechHud } from './viewer/MechHud';
import { VirtualStick } from './VirtualStick';
import styles from './InputRelayHostApp.module.css';

// three は window を前提にするので、サーバーでは描画しない
const MechViewer = dynamic(() => import('./viewer/MechViewer').then((m) => m.MechViewer), { ssr: false });

export type InputRelayHostAppProps = {
  /** スマホから開く PC の URL 候補（開発サーバーが LAN IP から求めたもの）。本番では空 */
  readonly lanOrigins: ReadonlyArray<string>;
};

/** 設定画面の左の目次 */
const SETTINGS_TABS = [
  { id: 'link', label: 'スマホと接続', en: 'LINK' },
  { id: 'unit', label: '機体と練習', en: 'UNIT' },
  { id: 'input', label: '操作', en: 'INPUT' },
  { id: 'log', label: '遅延とログ', en: 'LOG' },
  { id: 'pages', label: 'ほかの画面', en: 'PAGES' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

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
/**
 * 指で操作する端末（スマホ・タブレット）か。タッチ操作の初期値に使う。
 * 主な入力が指か、マウスのホバーがない端末なら指とみなす
 */
const COARSE_POINTER = '(pointer: coarse), (hover: none)';
/** 「PC 版サイトを表示」にしたスマホでも指とみなす（画面の短い辺がこれ以下でタッチできる端末） */
const PHONE_SHORT_SIDE_PX = 600;
const subscribeCoarsePointer = (onChange: () => void) => {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const readCoarsePointer = () =>
  window.matchMedia(COARSE_POINTER).matches ||
  (navigator.maxTouchPoints > 0 && Math.min(window.screen.width, window.screen.height) <= PHONE_SHORT_SIDE_PX);
const readServerCoarsePointer = () => false;
/** タッチ用ボタンはキーボードに反応させない（キーボードは隠したコントローラが受け持つ） */
const NO_KEYS: Readonly<Record<string, ArcadePhysicalButton>> = {};
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
  // PC 画面をスマホで開いたときのタッチ操作。指で操作する端末なら最初から出す
  const coarsePointer = useSyncExternalStore(subscribeCoarsePointer, readCoarsePointer, readServerCoarsePointer);
  const [touchOverride, setTouchOverride] = useState<boolean | null>(null);
  const touchControls = touchOverride ?? coarsePointer;
  // タッチ操作の中で、レバー（スティック）とボタンは別々に出し分けられる
  const [touchLever, setTouchLever] = useState(true);
  const [touchButtons, setTouchButtons] = useState(true);
  const showStick = touchControls && touchLever;
  const showTouchButtons = touchControls && touchButtons;
  // ステップ判定は、スティックが上下左右の 1 方向にまとめて別に数える（斜めにぶれても同じ方向として 2 回になる）
  const handleStickLever = useCallback((direction: LeverDirection, pressed: boolean) => {
    setLever(worldRef.current, direction, pressed, { countTap: false });
  }, []);
  const handleStickTap = useCallback((direction: LeverDirection) => {
    tapLever(worldRef.current, direction);
  }, []);
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
  // キーボードだけで練習するときは接続案内を閉じられる。
  // スマホで開いたときはその端末で直接操作するので、最初から閉じておく（設定から開ける）。
  // 案内は機体選択を閉じた後に出るので、初回描画（指かどうか未判定）で一瞬出ることはない
  const [guideOverride, setGuideHidden] = useState<boolean | null>(null);
  const guideHidden = guideOverride ?? coarsePointer;
  // 3D と HUD 以外（接続・機体・遅延・ログ・技表など）は設定画面にまとめる
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('link');
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
  const fullscreen = useFullscreen();
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
              {origin}/practice
            </code>
          ))
        ) : (
          <span>このサイトのフリー練習（/practice）</span>
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
        <MechHud worldRef={worldRef} showLever={!showStick} compact={touchControls} />

        {/* タッチ操作: スティックは左下、ボタンは右下に半透明で重ねる（左右の親指で持つ配置） */}
        {showStick && (
          <div className={styles.touchStick} data-testid="touch-stick">
            <VirtualStick onLever={handleStickLever} onTap={handleStickTap} />
          </div>
        )}
        {showTouchButtons && (
          <div className={styles.touchButtons} data-testid="touch-buttons">
            <ArcadeController
              variant="touch"
              onButtonPress={handleKeyboardInput}
              onRawInput={handleKeyboardRaw}
              keyboardKeys={NO_KEYS}
            />
          </div>
        )}

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
                SETTINGS<small>設定</small>
              </h2>
              <span className={styles.connChip} data-state={host.connection}>
                <span className={styles.connDot} data-state={host.connection} aria-hidden="true" />
                {CONNECTION_LABELS[host.connection]}
                {host.room && ` · ${host.room}`}
              </span>
              <button type="button" className={styles.closeButton} onClick={() => setSettingsOpen(false)}>
                閉じる <kbd className={styles.key}>Esc</kbd>
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* 項目が多いので 1 画面に詰めず、左の目次で分ける */}
              <nav className={styles.sideNav} aria-label="設定の項目">
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={styles.sideNavItem}
                    aria-current={settingsTab === tab.id ? 'page' : undefined}
                    onClick={() => setSettingsTab(tab.id)}
                  >
                    {tab.label}
                    <span className={styles.sideNavEn}>{tab.en}</span>
                  </button>
                ))}
              </nav>

              <div className={styles.pane}>
                {settingsTab === 'link' && (
                  <section aria-label="スマホとの接続" className={styles.modalSection}>
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
                        {connectSteps}
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
                  </section>
                )}

                {settingsTab === 'unit' && (
                  <section aria-label="機体と練習" className={styles.modalSection}>
                    <div className={styles.unitRow}>
                      <span className={styles.unitName}>
                        <span className={styles.caption}>MOBILE SUIT</span>
                        {unit.name}
                      </span>
                      <button type="button" className={styles.restart} onClick={() => setSelecting(true)}>
                        機体を変える
                      </button>
                    </div>
                    <Toggle label="敵の射撃" checked={enemyFires} onChange={toggleEnemyFire} description="敵が撃ってくるビームを出す。誘導切りの練習に" />
                    <Toggle label="敵の移動" checked={enemyMoves} onChange={toggleEnemyMoves} description="止めると敵はその場に立ったままになる" />
                    <h3 className={styles.subHeading}>技表</h3>
                    <CommandList unit={unit} />
                  </section>
                )}

                {settingsTab === 'input' && (
                  <section aria-label="操作" className={styles.modalSection}>
                    <Toggle
                      label="タッチ操作"
                      checked={touchControls}
                      onChange={setTouchOverride}
                      description="この画面をスマホで開いて操作するとき用。左下にスティック、右下に射撃・格闘・ジャンプのボタンが出る"
                    />
                    <div className={styles.subToggles}>
                      <Toggle label="レバー" checked={showStick} onChange={setTouchLever} disabled={!touchControls} />
                      <Toggle label="ボタン" checked={showTouchButtons} onChange={setTouchButtons} disabled={!touchControls} />
                    </div>
                    <h3 className={styles.subHeading}>キーボード操作</h3>
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
                  </section>
                )}

                {settingsTab === 'log' && (
                  <section aria-label="遅延と入力ログ" className={styles.modalSection}>
                    <h3 className={styles.subHeading}>遅延（ms）</h3>
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
                    <h3 className={styles.subHeading}>入力ログ</h3>
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
                )}

                {/* 3D ビューはヘッダーを出さないので、ほかの画面へはここから移る */}
                {settingsTab === 'pages' && (
                  <nav aria-label="ほかの画面" className={styles.modalSection}>
                    <div className={styles.navList}>
                      <Link href="/practice" className={styles.navLink}>
                        フリー練習（スマホ）
                      </Link>
                      <Link href="/commands" className={styles.navLink}>
                        コマンド一覧・練習
                      </Link>
                      <Link href="/commands/new" className={styles.navLink}>
                        コマンドを登録する
                      </Link>
                    </div>
                    <AuthButton />
                    {fullscreen.mode !== 'installed' && (
                      <>
                        <h3 className={styles.subHeading}>全画面</h3>
                        {fullscreen.mode === 'api' ? (
                          <button
                            type="button"
                            className={styles.restart}
                            onClick={fullscreen.toggle}
                            aria-pressed={fullscreen.active}
                          >
                            {fullscreen.active ? '全画面をやめる' : '全画面にする'}
                          </button>
                        ) : (
                          <p className={styles.note} data-testid="home-screen-guide">
                            共有 → ホーム画面に追加 で開くと、アドレスバーやタブバーなしで使えます
                          </p>
                        )}
                      </>
                    )}
                  </nav>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {selecting && <UnitSelect currentId={unitId} onSelect={selectUnit} onClose={closeSelect} />}
    </div>
  );
}
