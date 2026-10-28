'use client';

/**
 * 3D ビューに重ねる HUD。sim は ref の中で毎フレーム動くので、ここは間引いて読む。
 */
import { useEffect, useState, type RefObject } from 'react';
import { BOOST_MAX } from '../sim/actions';
import type { LeverDirection, SimEvent, SimWorld } from '../sim/types';
import { unitById } from '../sim/units';
import styles from './MechHud.module.css';

const HUD_INTERVAL_MS = 50;
/** ルート名や「出せなかった」表示を残す時間（sim の秒） */
const EVENT_SHOW_S = 0.9;

type HudSnapshot = {
  boost: number;
  overheat: boolean;
  landing: boolean;
  grounded: boolean;
  action: string;
  chargingShot: boolean;
  chargingMelee: boolean;
  hitCount: number;
  mechHits: number;
  airBoostUses: number;
  /** つないだ行動の並び（表示名） */
  chain: string[];
  route: SimEvent | null;
  reject: SimEvent | null;
  lever: LeverDirection[];
  unitName: string;
  ammo: Array<{ key: string; label: string; count: number; max: number; reloadRatio: number }>;
  /** 時限強化の残り（0〜1）。強化がない機体・使っていないときは null */
  seed: number | null;
  seedCooldown: number;
  packOut: boolean;
};

const LEVER_ARROWS: ReadonlyArray<{ direction: LeverDirection; glyph: string }> = [
  { direction: 'forward', glyph: '▲' },
  { direction: 'left', glyph: '◀' },
  { direction: 'right', glyph: '▶' },
  { direction: 'back', glyph: '▼' },
];

function latest(world: SimWorld, kind: SimEvent['kind']): SimEvent | null {
  for (let i = world.events.length - 1; i >= 0; i--) {
    const e = world.events[i];
    if (e.kind !== kind) continue;
    return world.time - e.time <= EVENT_SHOW_S ? e : null;
  }
  return null;
}

function unitSnapshot(world: SimWorld): Pick<HudSnapshot, 'unitName' | 'ammo' | 'seed' | 'seedCooldown' | 'packOut'> {
  const unit = unitById(world.unitId);
  const { mech } = world;
  return {
    unitName: unit.name,
    ammo: Object.entries(unit.ammo).map(([key, def]) => {
      const state = mech.ammo[key] ?? { count: def.max, timer: 0 };
      const reload = mech.seedTime > 0 ? (def.seedReload ?? def.reload) : def.reload;
      return { key, label: def.label, count: state.count, max: def.max, reloadRatio: Math.min(1, state.timer / reload) };
    }),
    seed: mech.seedTime > 0 && unit.seedDuration ? mech.seedTime / unit.seedDuration : null,
    seedCooldown: mech.seedCooldown,
    packOut: mech.packOut,
  };
}

function snapshot(world: SimWorld): HudSnapshot {
  const { mech } = world;
  return {
    boost: mech.boost,
    overheat: mech.overheat,
    landing: mech.landingLag > 0,
    grounded: mech.grounded,
    action: mech.move?.label ?? '',
    chargingShot: mech.charging.shot,
    chargingMelee: mech.charging.melee,
    hitCount: world.enemy.hitCount,
    mechHits: world.mechHits,
    airBoostUses: mech.airBoostUses,
    chain: mech.action === 'idle' ? [] : mech.chainLabels,
    route: latest(world, 'route'),
    reject: latest(world, 'reject'),
    lever: [...mech.leverHeld],
    ...unitSnapshot(world),
  };
}

export type MechHudProps = {
  worldRef: RefObject<SimWorld>;
  /** 左下のレバー表示（矢印）を出すか。タッチのスティックを出している間は隠す */
  showLever?: boolean;
  /** 右下にタッチ用ボタンが出ているか。出ている間は残弾の札を左上に詰め、ブーストゲージを細くする */
  touchButtons?: boolean;
};

export function MechHud({ worldRef, showLever = true, touchButtons = false }: MechHudProps) {
  const [hud, setHud] = useState<HudSnapshot | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setHud(snapshot(worldRef.current)), HUD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [worldRef]);

  if (hud === null) return null;
  const ratio = Math.max(0, Math.min(1, hud.boost / BOOST_MAX));
  const status = hud.overheat ? 'OVERHEAT' : hud.landing ? 'LANDING' : hud.grounded ? '' : 'AIR';

  return (
    <div className={styles.hud} data-testid="mech-hud" data-touch-buttons={touchButtons}>
      <div className={styles.topLeft}>
        <span className={styles.caption}>HIT</span>
        <span className={styles.hits}>{hud.hitCount}</span>
        <span className={styles.caption}>被弾</span>
        <span className={styles.damage}>{hud.mechHits}</span>
      </div>
      <div className={styles.action} key={hud.action}>
        {hud.action}
      </div>
      {hud.route && (
        <div className={styles.route} key={`route-${hud.route.id}`}>
          {hud.route.label}
        </div>
      )}
      {hud.reject && (
        <div className={styles.reject} key={`reject-${hud.reject.id}`}>
          × {hud.reject.label}
        </div>
      )}
      {hud.chain.length > 1 && <div className={styles.chain}>{hud.chain.join(' › ')}</div>}
      <div className={styles.charge}>
        {hud.chargingShot && <span className={styles.chargeShot}>射CS チャージ中</span>}
        {hud.chargingMelee && <span className={styles.chargeMelee}>格CS チャージ中</span>}
      </div>
      <div className={styles.unit}>
        <span className={styles.unitName}>{hud.unitName}</span>
        {hud.seed !== null && (
          <div className={styles.seed}>
            SEED <span className={styles.seedBar}><span style={{ transform: `scaleX(${hud.seed})` }} /></span>
          </div>
        )}
        {hud.seed === null && hud.seedCooldown > 0 && (
          <div className={styles.seedWait}>SEED まで {Math.ceil(hud.seedCooldown)}s</div>
        )}
      </div>
      {/* タッチ操作中はスティックが同じ場所に出るので隠す */}
      {showLever && (
        <div className={styles.lever} aria-label="レバー">
          {LEVER_ARROWS.map(({ direction, glyph }) => (
            <span key={direction} className={styles.arrow} data-direction={direction} data-on={hud.lever.includes(direction)}>
              {glyph}
            </span>
          ))}
        </div>
      )}
      {/* ブーストゲージは EXVS と同じく画面中央下。斜めに切った横長のゲージ */}
      <div className={styles.boost}>
        {status && (
          <span className={styles.status} data-status={status}>
            {status}
          </span>
        )}
        <div className={styles.gauge}>
          <div className={styles.fill} data-overheat={hud.overheat} style={{ transform: `scaleX(${ratio})` }} />
        </div>
        <span className={styles.boostLabel}>
          BOOST <span className={styles.uses} data-heavy={hud.airBoostUses > 3}>×{hud.airBoostUses}</span>
        </span>
      </div>
      {/* 残弾は EXVS と同じく画面右下に、武装ごとの札を縦に積む */}
      {hud.ammo.length > 0 && (
        <ul className={styles.weapons} aria-label="残弾">
          {hud.ammo.map((a) => (
            <li key={a.key} className={styles.weapon} data-empty={a.count === 0}>
              <span className={styles.weaponCount}>{a.key === 'ootori' && hud.packOut ? '–' : a.count}</span>
              <span className={styles.weaponBody}>
                <span className={styles.weaponName}>{a.key === 'ootori' && hud.packOut ? `${a.label}（射出中）` : a.label}</span>
                <span className={styles.weaponReload}>
                  <span style={{ transform: `scaleX(${a.count < a.max ? a.reloadRatio : 1})` }} />
                </span>
                <span className={styles.weaponCaption}>WEAPON</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
