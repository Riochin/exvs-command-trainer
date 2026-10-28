'use client';

/**
 * 3D ビューに重ねる HUD。sim は ref の中で毎フレーム動くので、ここは間引いて読む。
 */
import { useEffect, useState, type RefObject } from 'react';
import { BOOST_MAX } from '../sim/actions';
import { chargeRatio } from '../sim/step';
import type { LeverDirection, SimEvent, SimWorld } from '../sim/types';
import { unitById, weaponPanelName, type WeaponButton, type WeaponPanelDef } from '../sim/units';
import { hudLabel } from './hudLabels';
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
  hitCount: number;
  mechHits: number;
  airBoostUses: number;
  /** つないだ行動の並び（表示名） */
  chain: string[];
  route: SimEvent | null;
  reject: SimEvent | null;
  lever: LeverDirection[];
  unitName: string;
  weapons: WeaponRow[];
  /** 時限強化の残り（0〜1）。強化がない機体・使っていないときは null */
  seed: number | null;
  seedCooldown: number;
};

/** 右下の武装パネル 1 行ぶん */
type WeaponRow = {
  key: string;
  name: string;
  buttons: ReadonlyArray<WeaponButton>;
  lever: string | null;
  /** 大きく出す数字。弾がない行や射出中は '–'、時限強化中は残り秒数 */
  count: string;
  /** 上のゲージ（残弾・リロード・強化の残り）0〜1 */
  gauge: number;
  empty: boolean;
  /** チャージのゲージ（0〜1）。チャージのない行は null */
  charge: number | null;
  /** 格闘 CS の行。コマンドの上に CHARGE! を出す */
  chargeTag: boolean;
};

const BUTTON_ORDER: ReadonlyArray<WeaponButton> = ['shot', 'melee', 'jump'];
const BUTTON_NAMES: Record<WeaponButton, string> = { shot: '射撃', melee: '格闘', jump: 'ジャンプ' };
const LEVER_NAMES = { front: '前', side: '横', back: '後' } as const;

const LEVER_ARROWS: ReadonlyArray<{ direction: LeverDirection; glyph: string }> = [
  { direction: 'forward', glyph: '▲' },
  { direction: 'left', glyph: '◀' },
  { direction: 'right', glyph: '▶' },
  { direction: 'back', glyph: '▼' },
];

/** 表示時間内でいちばん新しい、HUD に出す出来事。label は表示名に置き換える */
function latest(world: SimWorld, kind: SimEvent['kind']): SimEvent | null {
  for (let i = world.events.length - 1; i >= 0; i--) {
    const e = world.events[i];
    if (world.time - e.time > EVENT_SHOW_S) return null;
    if (e.kind !== kind) continue;
    // 出さない出来事は飛ばして、その前の出す出来事を探す
    const label = hudLabel(e);
    if (label !== null) return { ...e, label };
  }
  return null;
}

function weaponRow(world: SimWorld, panel: WeaponPanelDef, index: number): WeaponRow {
  const unit = unitById(world.unitId);
  const { mech } = world;
  const charge = panel.charge ? chargeRatio(world, panel.charge) : null;
  const base = {
    key: `${index}-${panel.ammo ?? panel.charge}`,
    name: weaponPanelName(panel),
    buttons: panel.buttons,
    lever: panel.lever ? LEVER_NAMES[panel.lever] : null,
    charge,
    chargeTag: panel.charge === 'melee' && !panel.ammo,
  };
  const def = panel.ammo ? unit.ammo[panel.ammo] : undefined;
  if (def && panel.ammo) {
    const state = mech.ammo[panel.ammo] ?? { count: def.max, timer: 0 };
    const reload = mech.seedTime > 0 ? (def.seedReload ?? def.reload) : def.reload;
    const reloadRatio = Math.min(1, state.timer / reload);
    const packOut = def.waitsForPack === true && mech.packOut;
    return {
      ...base,
      count: packOut ? '–' : String(state.count),
      gauge: state.count < def.max ? reloadRatio : 1,
      empty: state.count === 0,
    };
  }
  // 弾のない格闘 CS の行。時限強化があれば残り秒数と、終わってからの待ちを出す
  if (mech.seedTime > 0 && unit.seedDuration) {
    return { ...base, count: String(Math.ceil(mech.seedTime)), gauge: mech.seedTime / unit.seedDuration, empty: false };
  }
  if (mech.seedCooldown > 0 && unit.seedCooldown) {
    return { ...base, count: '–', gauge: 1 - mech.seedCooldown / unit.seedCooldown, empty: true };
  }
  return { ...base, count: '–', gauge: 1, empty: false };
}

function unitSnapshot(world: SimWorld): Pick<HudSnapshot, 'unitName' | 'weapons' | 'seed' | 'seedCooldown'> {
  const unit = unitById(world.unitId);
  const { mech } = world;
  return {
    unitName: unit.name,
    weapons: unit.weapons.flatMap((panel, i) => (panel.onlyInSeed && mech.seedTime <= 0 ? [] : [weaponRow(world, panel, i)])),
    seed: mech.seedTime > 0 && unit.seedDuration ? mech.seedTime / unit.seedDuration : null,
    seedCooldown: mech.seedCooldown,
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

export function MechHud({ worldRef, showLever = true }: { worldRef: RefObject<SimWorld>; showLever?: boolean }) {
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
      {/* 残弾は EXVS と同じく画面右下。左に押すボタン、右に残弾とゲージ。チャージのある行はゲージが 2 段 */}
      {hud.weapons.length > 0 && (
        <ul className={styles.weapons} aria-label="武装">
          {hud.weapons.map((w) => (
            <li
              key={w.key}
              className={styles.weapon}
              data-empty={w.empty}
              data-full={w.charge === 1}
              aria-label={`${w.name}（${[w.lever ? `${w.lever}レバー` : '', ...w.buttons.map((b) => BUTTON_NAMES[b])].filter(Boolean).join('＋')}${w.chargeTag ? '長押し' : ''}）`}
            >
              <span className={styles.command}>
                {w.chargeTag && <span className={styles.chargeTag}>CHARGE!</span>}
                <span className={styles.buttons}>
                  {w.lever && <span className={styles.leverChip}>{w.lever}</span>}
                  {BUTTON_ORDER.map((b) => (
                    <span key={b} className={styles.button} data-button={b} data-on={w.buttons.includes(b)} />
                  ))}
                </span>
              </span>
              <span className={styles.panel}>
                <span className={styles.weaponCount}>{w.count}</span>
                <span className={styles.weaponName}>{w.name}</span>
                <span className={styles.gauges}>
                  <span className={styles.ammoGauge}>
                    <span style={{ transform: `scaleX(${w.gauge})` }} />
                  </span>
                  {w.charge !== null && (
                    <span className={styles.chargeGauge} data-testid="charge-gauge" data-ratio={w.charge.toFixed(2)}>
                      <span style={{ transform: `scaleX(${w.charge})` }} />
                      <b>CHARGE!</b>
                    </span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
