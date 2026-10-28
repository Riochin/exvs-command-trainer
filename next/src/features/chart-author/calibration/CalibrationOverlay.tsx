'use client';

/**
 * 動画の現在フレームの上で矩形をドラッグして描くための層。
 *
 * 表示サイズは動画の解像度とも拡大率とも一致しないので、ここで作る座標は
 * 必ずこの層自身の大きさで割った 0..1 の比率にする。実解像度に触れるのは
 * フレーム供給層だけで、校正は解像度を知らないまま成立する。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from '../types';
import styles from './CalibrationOverlay.module.css';
import type { OverlayRect } from './useCalibrationDraw';

export type CalibrationOverlayProps = {
  readonly rects: readonly OverlayRect[];
  /** いま描いている対象の名前。取り違えを防ぐため常に見せる */
  readonly activeLabel: string;
  readonly disabled: boolean;
  onDraw(rect: Rect): void;
};

/** 手が滑っただけのクリックを矩形にしないための下限（正規化座標） */
const MIN_NORMALIZED_SIZE = 0.005;

type DragState = {
  readonly bounds: DOMRect;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** ドラッグの両端から正規化矩形を作る。引いた向きに依らず同じ結果になる */
function toRect(drag: DragState): Rect {
  const x0 = clamp01((drag.fromX - drag.bounds.left) / drag.bounds.width);
  const y0 = clamp01((drag.fromY - drag.bounds.top) / drag.bounds.height);
  const x1 = clamp01((drag.toX - drag.bounds.left) / drag.bounds.width);
  const y1 = clamp01((drag.toY - drag.bounds.top) / drag.bounds.height);
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}

export function CalibrationOverlay({
  rects,
  activeLabel,
  disabled,
  onDraw,
}: CalibrationOverlayProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const onMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || layerRef.current === null) return;
      event.preventDefault();
      setDrag({
        // 掴んだ瞬間の大きさで測り切る。途中でレイアウトが動いても座標が跳ねない
        bounds: layerRef.current.getBoundingClientRect(),
        fromX: event.clientX,
        fromY: event.clientY,
        toX: event.clientX,
        toY: event.clientY,
      });
    },
    [disabled],
  );

  useEffect(() => {
    if (drag === null) return;

    // 層の外まで引かれても追えるよう、ドラッグ中だけ window を見る
    const onMouseMove = (event: MouseEvent): void => {
      setDrag((previous) =>
        previous === null ? previous : { ...previous, toX: event.clientX, toY: event.clientY },
      );
    };

    const onMouseUp = (event: MouseEvent): void => {
      const rect = toRect({ ...drag, toX: event.clientX, toY: event.clientY });
      setDrag(null);
      if (rect.width < MIN_NORMALIZED_SIZE || rect.height < MIN_NORMALIZED_SIZE) return;
      onDraw(rect);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [drag, onDraw]);

  const preview = drag === null ? null : toRect(drag);

  return (
    <div
      ref={layerRef}
      className={disabled ? styles.layerDisabled : styles.layer}
      data-testid="calibration-overlay"
      onMouseDown={onMouseDown}
    >
      {rects.map((item) => (
        <div
          key={item.id}
          className={`${styles.rect} ${styles[item.variant]}`}
          data-testid="calibration-rect"
          style={{
            left: percent(item.rect.x),
            top: percent(item.rect.y),
            width: percent(item.rect.width),
            height: percent(item.rect.height),
          }}
        >
          <span className={styles.rectLabel}>{item.label}</span>
        </div>
      ))}

      {preview !== null && (
        <div
          className={styles.preview}
          data-testid="calibration-preview"
          style={{
            left: percent(preview.x),
            top: percent(preview.y),
            width: percent(preview.width),
            height: percent(preview.height),
          }}
        />
      )}

      {!disabled && <span className={styles.activeLabel}>{activeLabel} を描く</span>}
    </div>
  );
}
