'use client';

/**
 * タッチ用のバーチャルスティック（レバー）。
 *
 * 指を置いた位置からの傾きを 8 方向に丸め、レバーの「倒す・戻す」に直して通知する。
 * 指を離すと中央に戻る。素早く同じ方向へ 2 回弾けば、レバー 2 回入力としてステップになる。
 */
import { useRef, useState } from 'react';
import type { LeverDirection } from './sim/types';
import styles from './VirtualStick.module.css';

/** 中立からこの割合（半径比）以上傾けたら倒したことにする */
export const STICK_DEAD_ZONE = 0.25;

/**
 * いったん倒したあとは、この割合未満まで戻したら中立に戻す。
 * 倒す境目より少し内側に置き、境目で指が震えても倒す・戻すを繰り返さない（ステップの誤入力を防ぐ）
 */
export const STICK_RELEASE_ZONE = 0.18;

/**
 * 倒したまま上下左右の受け持ちを変えるには、新しい方向の成分が今の方向の成分のこの倍を超える必要がある。
 * 45 度の境目に約 7 度の遊びを持たせ、斜めで指が震えても 2 回弾いた扱いにしない
 */
export const STICK_TAP_SWITCH_RATIO = 1.3;

/**
 * 画面上の傾き（右が +x、上が +y）から、倒しているレバーの方向を求める。
 * 斜めは 2 方向を同時に倒している扱い。
 */
export function stickDirections(x: number, y: number, deadZone = STICK_DEAD_ZONE): LeverDirection[] {
  if (Math.hypot(x, y) < deadZone) return [];
  // 0 = 右、反時計回り。45 度ずつの 8 区画に丸める
  const sector = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  const table: Record<number, LeverDirection[]> = {
    0: ['right'],
    1: ['forward', 'right'],
    2: ['forward'],
    3: ['forward', 'left'],
    4: ['left'],
    [-4]: ['left'],
    [-3]: ['back', 'left'],
    [-2]: ['back'],
    [-1]: ['back', 'right'],
  };
  return table[sector] ?? [];
}

const TAP_VECTORS: Record<LeverDirection, readonly [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  forward: [0, 1],
  back: [0, -1],
};

/**
 * ステップ判定に使う、倒している 1 方向。上下左右を 90 度ずつ受け持ち、判定しない区間はない
 * （斜め右上でも、ぎりぎり上寄りなら上）。移動は stickDirections の 8 方向のまま。
 * current（今倒している方向）を渡すと、境目を少し越えただけでは受け持ちを変えない
 */
export function stickTapDirection(
  x: number,
  y: number,
  deadZone = STICK_DEAD_ZONE,
  current: LeverDirection | null = null,
): LeverDirection | null {
  if (Math.hypot(x, y) < deadZone) return null;
  const next: LeverDirection = Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'forward' : 'back';
  if (current === null || next === current) return next;
  const along = (d: LeverDirection) => x * TAP_VECTORS[d][0] + y * TAP_VECTORS[d][1];
  const held = along(current);
  return held > 0 && along(next) < held * STICK_TAP_SWITCH_RATIO ? current : next;
}

/**
 * つまみがいちばん倒れたときに中心から動く距離（つまみの大きさに対する %）。
 * つまみは台の 64% なので、28% 動くとつまみの縁が台の縁の近くまで届く
 */
const KNOB_TRAVEL_PCT = 28;

export type VirtualStickProps = {
  /** レバーを倒した・戻した方向を 1 つずつ通知する */
  onLever: (direction: LeverDirection, pressed: boolean) => void;
  /**
   * レバーを 1 回倒したこと（ステップ判定用）を、上下左右の 1 方向で通知する。
   * 中立から倒したときと、倒したまま受け持ちの方向が変わったときに呼ぶ
   */
  onTap?: (direction: LeverDirection) => void;
};

export function VirtualStick({ onLever, onTap }: VirtualStickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const heldRef = useRef<LeverDirection[]>([]);
  const tapRef = useRef<LeverDirection | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (held: LeverDirection[]) => {
    const previous = heldRef.current;
    for (const d of previous) if (!held.includes(d)) onLever(d, false);
    for (const d of held) if (!previous.includes(d)) onLever(d, true);
    heldRef.current = held;
  };

  const track = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2;
    // 画面の y は下向きなので反転する
    const dx = (clientX - (rect.left + radius)) / radius;
    const dy = -(clientY - (rect.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    const scale = len > 1 ? 1 / len : 1;
    setKnob({ x: dx * scale, y: dy * scale });
    // 倒しているあいだは、中立に戻す境目を倒す境目より内側にする
    const deadZone = tapRef.current === null ? STICK_DEAD_ZONE : STICK_RELEASE_ZONE;
    update(stickDirections(dx, dy, deadZone));
    const tap = stickTapDirection(dx, dy, deadZone, tapRef.current);
    if (tap !== tapRef.current) {
      tapRef.current = tap;
      if (tap !== null) onTap?.(tap);
    }
  };

  const release = () => {
    pointerRef.current = null;
    tapRef.current = null;
    setKnob({ x: 0, y: 0 });
    update([]);
  };

  return (
    <div
      ref={baseRef}
      className={styles.base}
      data-testid="virtual-stick"
      aria-label="レバー"
      role="application"
      onPointerDown={(e) => {
        if (pointerRef.current !== null) return;
        pointerRef.current = e.pointerId;
        // 指が台の外へ出ても追いかける。捕まえられない環境でも操作は続ける
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          // 何もしない
        }
        track(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointerRef.current === e.pointerId) track(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (pointerRef.current === e.pointerId) release();
      }}
      onPointerCancel={(e) => {
        if (pointerRef.current === e.pointerId) release();
      }}
    >
      <span
        className={styles.knob}
        style={{
          transform: `translate(calc(-50% + ${knob.x * KNOB_TRAVEL_PCT}%), calc(-50% + ${-knob.y * KNOB_TRAVEL_PCT}%))`,
        }}
      />
    </div>
  );
}
