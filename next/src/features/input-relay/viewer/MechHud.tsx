'use client';

/**
 * 3D ビューに重ねる HUD。sim は ref の中で毎フレーム動くので、ここは間引いて読む。
 */
import { useEffect, useState, type RefObject } from 'react';
import { actionLabel, BOOST_MAX } from '../sim/actions';
import type { SimWorld } from '../sim/types';
import styles from './MechHud.module.css';

const HUD_INTERVAL_MS = 50;

type HudSnapshot = {
  boost: number;
  overheat: boolean;
  landing: boolean;
  grounded: boolean;
  action: string;
  chargingShot: boolean;
  chargingMelee: boolean;
  hitCount: number;
};

function snapshot(world: SimWorld): HudSnapshot {
  const { mech } = world;
  return {
    boost: mech.boost,
    overheat: mech.overheat,
    landing: mech.landingLag > 0,
    grounded: mech.grounded,
    action: actionLabel(mech.action),
    chargingShot: mech.charging.shot,
    chargingMelee: mech.charging.melee,
    hitCount: world.enemy.hitCount,
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
      </div>
      <div className={styles.action} key={hud.action}>
        {hud.action}
      </div>
      <div className={styles.charge}>
        {hud.chargingShot && <span className={styles.chargeShot}>射CS チャージ中</span>}
        {hud.chargingMelee && <span className={styles.chargeMelee}>格CS チャージ中</span>}
      </div>
      <div className={styles.boost}>
        <div className={styles.boostHead}>
          <span className={styles.caption}>BOOST</span>
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
