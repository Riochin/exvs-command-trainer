'use client';

/**
 * 時刻順のステップ一覧と絞り込み。
 *
 * 目視確認の入口。ここは表示と操作の受け渡しに徹し、絞り込みの適用も
 * 選択の保持も `useChartEditor` 側に任せる。この画面が受け取る `steps` は
 * すでに絞り込み済みの列（`visibleSteps`）であることを前提とする。
 */
import { useMemo } from 'react';
import type { ButtonType } from '@/types';
import type { ChartStepOrigin } from '@/types/chart';
import { INPUT_LABELS, INPUT_TYPES } from '../inputLabels';
import { formatTimecode } from '../player/timecode';
import type { EditorStep, StepFilter } from '../types';
import { findNearestStep } from './nearestStep';
import { candidateReason, isCandidateStep, ORIGIN_LABELS, ORIGINS } from './stepDisplay';
import styles from './StepList.module.css';

/** 最小信頼度スライダの刻み。検出器が割り当てる値の差を拾える程度に細かく取る */
const CONFIDENCE_STEP = 0.05;

export type StepListProps = {
  /** 絞り込み適用済みのステップ。並び順はこの画面が保証する */
  readonly steps: readonly EditorStep[];
  readonly selectedId: string | null;
  /** 強調するステップを決めるための現在の再生位置 */
  readonly currentTimeMs: number;
  readonly filter: StepFilter;
  onSelect(id: string): void;
  onChangeFilter(next: StepFilter): void;
};

/**
 * チェックの入り切りを絞り込みの値へ直す。
 *
 * `null` は「絞り込まない」なので、全件が選ばれた状態は配列ではなく
 * `null` に畳む。そうしないと種別が増えたときに古い配列が取り残される。
 */
function toggleSelection<T>(
  all: readonly T[],
  current: readonly T[] | null,
  value: T,
): readonly T[] | null {
  const selected = new Set<T>(current ?? all);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);

  const next = all.filter((item) => selected.has(item));
  return next.length === all.length ? null : next;
}

function isChecked<T>(current: readonly T[] | null, value: T): boolean {
  return current === null || current.includes(value);
}

export function StepList({
  steps,
  selectedId,
  currentTimeMs,
  filter,
  onSelect,
  onChangeFilter,
}: StepListProps) {
  // 呼び出し側の不変条件に頼らず、この画面が見せる順序はこの画面が決める
  const ordered = useMemo(() => [...steps].sort((a, b) => a.tMs - b.tMs), [steps]);
  const nearestId = useMemo(
    () => findNearestStep(ordered, currentTimeMs)?.id ?? null,
    [ordered, currentTimeMs],
  );

  const changeInputs = (input: ButtonType): void =>
    onChangeFilter({ ...filter, inputs: toggleSelection(INPUT_TYPES, filter.inputs, input) });

  const changeOrigins = (origin: ChartStepOrigin): void =>
    onChangeFilter({ ...filter, origins: toggleSelection(ORIGINS, filter.origins, origin) });

  return (
    <section className={styles.panel} data-testid="step-list">
      <h2 className={styles.heading}>ステップ一覧</h2>

      <div className={styles.filters}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>入力種別</legend>
          <div className={styles.chips}>
            {INPUT_TYPES.map((input) => (
              <label key={input} className={styles.chip}>
                <input
                  type="checkbox"
                  checked={isChecked(filter.inputs, input)}
                  onChange={() => changeInputs(input)}
                />
                {INPUT_LABELS[input]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>由来</legend>
          <div className={styles.chips}>
            {ORIGINS.map((origin) => (
              <label key={origin} className={styles.chip}>
                <input
                  type="checkbox"
                  checked={isChecked(filter.origins, origin)}
                  onChange={() => changeOrigins(origin)}
                />
                {ORIGIN_LABELS[origin]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className={styles.confidenceFilter}>
          <span className={styles.legend}>
            最小信頼度
            <span className={styles.filterValue} data-testid="min-confidence-value">
              {filter.minConfidence.toFixed(2)}
            </span>
          </span>
          <input
            type="range"
            className={styles.slider}
            aria-label="最小信頼度"
            min={0}
            max={1}
            step={CONFIDENCE_STEP}
            value={filter.minConfidence}
            onChange={(event) =>
              onChangeFilter({ ...filter, minConfidence: Number(event.target.value) })
            }
          />
        </label>
      </div>

      {ordered.length === 0 ? (
        <p className={styles.empty} data-testid="step-list-empty">
          表示できるステップがありません
        </p>
      ) : (
        <ul className={styles.list}>
          {ordered.map((step) => {
            const reason = candidateReason(step);
            return (
              <li key={step.id}>
                <button
                  type="button"
                  className={styles.row}
                  data-testid="step-row"
                  data-step-id={step.id}
                  data-selected={String(step.id === selectedId)}
                  data-nearest={String(step.id === nearestId)}
                  data-candidate={String(isCandidateStep(step))}
                  aria-current={step.id === selectedId ? 'true' : undefined}
                  onClick={() => onSelect(step.id)}
                >
                  <span className={styles.time}>{formatTimecode(step.tMs)}</span>
                  <span className={styles.input}>{INPUT_LABELS[step.input]}</span>
                  <span className={styles.confidence}>{step.confidence.toFixed(2)}</span>
                  <span className={styles.origin}>{ORIGIN_LABELS[step.origin]}</span>
                  {reason !== null && <span className={styles.candidate}>要確認 / {reason}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
