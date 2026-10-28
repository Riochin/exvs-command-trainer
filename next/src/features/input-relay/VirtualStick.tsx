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

/** 傾きがこの割合（半径比）未満なら中立 */
export const STICK_DEAD_ZONE = 0.35;

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

export type VirtualStickProps = {
  /** レバーを倒した・戻した方向を 1 つずつ通知する */
  onLever: (direction: LeverDirection, pressed: boolean) => void;
};

export function VirtualStick({ onLever }: VirtualStickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const heldRef = useRef<LeverDirection[]>([]);
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
    update(stickDirections(dx, dy));
  };

  const release = () => {
    pointerRef.current = null;
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
        style={{ transform: `translate(calc(-50% + ${knob.x * 35}%), calc(-50% + ${-knob.y * 35}%))` }}
      />
    </div>
  );
}
