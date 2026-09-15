'use client';

/**
 * 動画の尺に対応した横軸と、その上のステップマーカー。
 *
 * 一覧が「1 件ずつ確かめる」ための画面なのに対し、こちらは「全体の粗密を
 * 一目で見る」ための画面。候補の色分けは一覧と同じ規則（`isCandidateStep`）を
 * 使い、同じステップが 2 つの画面で違って見えないようにする（Req 4.4）。
 */
import { INPUT_LABELS } from '../inputLabels';
import { formatTimecode } from '../player/timecode';
import type { EditorStep } from '../types';
import { isCandidateStep } from './stepDisplay';
import styles from './Timeline.module.css';

export type TimelineProps = {
  readonly steps: readonly EditorStep[];
  readonly durationMs: number;
  readonly currentTimeMs: number;
  readonly selectedId: string | null;
  onSelect(id: string): void;
};

/**
 * 時刻を軸上の位置（%）へ直す。
 *
 * 尺が未取得（0）の間は比率を決められないので左端に寄せる。尺を超える時刻は
 * 軸の外へ出さず右端で止める。マーカーが軸から消えると、ずれている事実自体が
 * 見えなくなるため。
 */
function positionPercent(tMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.min(100, Math.max(0, (tMs / durationMs) * 100));
}

export function Timeline({
  steps,
  durationMs,
  currentTimeMs,
  selectedId,
  onSelect,
}: TimelineProps) {
  return (
    <div className={styles.timeline} data-testid="timeline">
      <div className={styles.track}>
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            className={styles.marker}
            data-testid="timeline-marker"
            data-step-id={step.id}
            data-selected={String(step.id === selectedId)}
            data-candidate={String(isCandidateStep(step))}
            style={{ left: `${positionPercent(step.tMs, durationMs)}%` }}
            aria-label={`${formatTimecode(step.tMs)} ${INPUT_LABELS[step.input]}`}
            onClick={() => onSelect(step.id)}
          />
        ))}
        <div
          className={styles.playhead}
          data-testid="timeline-playhead"
          style={{ left: `${positionPercent(currentTimeMs, durationMs)}%` }}
        />
      </div>
      <div className={styles.scale}>
        <span>{formatTimecode(0)}</span>
        <span>{formatTimecode(durationMs)}</span>
      </div>
    </div>
  );
}
