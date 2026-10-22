'use client';

/**
 * 3D ビューに重ねる HUD。sim は ref の中で毎フレーム動くので、ここは間引いて読む。
 */
import { useEffect, useState, type RefObject } from 'react';
import { BOOST_MAX } from '../sim/actions';
import type { LeverDirection, SimEvent, SimWorld } from '../sim/types';
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
  };
}

export function MechHud({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const [hud, setHud] = useState<HudSnapshot | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setHud(snapshot(worldRef.current)), HUD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [worldRef]);

  if (hud === null) return null;
  const ratio = Math.max(0, Math.min(1, hud.boost / BOOST_MAX));
  const status = hud.overheat ? 'OVERHEAT' : hud.landing ? 'LANDING' : hud.grounded ? '' : 'AIR';

  return (
    <div className={styles.hud} data-testid="mech-hud">
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
      <div className={styles.lever} aria-label="レバー">
        {LEVER_ARROWS.map(({ direction, glyph }) => (
          <span key={direction} className={styles.arrow} data-direction={direction} data-on={hud.lever.includes(direction)}>
            {glyph}
          </span>
        ))}
      </div>
      <div className={styles.boost}>
        <div className={styles.boostHead}>
          <span className={styles.caption}>
            BOOST <span className={styles.uses} data-heavy={hud.airBoostUses > 3}>×{hud.airBoostUses}</span>
          </span>
          {status && (
            <span className={styles.status} data-status={status}>
              {status}
            </span>
          )}
        </div>
        <div className={styles.gauge}>
          <div
            className={styles.fill}
            data-overheat={hud.overheat}
            style={{ transform: `scaleX(${ratio})` }}
          />
        </div>
      </div>
    </div>
  );
}
