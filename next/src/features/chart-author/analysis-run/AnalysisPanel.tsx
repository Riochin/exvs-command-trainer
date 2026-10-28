'use client';

/**
 * 解析の進み具合と結果の見せ方。
 *
 * ここは表示に徹する。走査の駆動もパラメータの保持も useAnalysisRun が持ち、
 * この画面は受け取った値を並べ、操作を呼び出しへ返すだけにする。
 */
import { DEFAULT_ANALYSIS_PARAMS } from '../constants';
import { inputLabel } from '../inputLabels';
import type { AnalysisParams, DetectionSummary } from '../types';
import styles from './AnalysisPanel.module.css';
import type { AnalysisFailure, AnalysisPhase, AnalysisProgress, AnalysisWarning } from './useAnalysisRun';

/** 閾値スライダの範囲。既定値を挟む形で、効きが分かる幅に取る */
const BOOST_THRESHOLD_MIN = 0.01;
const BOOST_THRESHOLD_MAX = 0.3;
const BOOST_THRESHOLD_STEP = 0.01;

export type AnalysisPanelProps = {
  readonly phase: AnalysisPhase;
  readonly progress: AnalysisProgress;
  readonly summary: DetectionSummary | null;
  readonly params: AnalysisParams;
  readonly failure: AnalysisFailure | null;
  readonly warning: AnalysisWarning | null;
  onCancel(): void;
  onChangeParams(next: AnalysisParams): void;
};

function describeFailure(failure: AnalysisFailure): string {
  if (failure.kind === 'calibration_invalid') {
    return `校正に不備があるため解析を始められません（${failure.defects.length} 件）`;
  }
  return failure.reason === 'decode_failed'
    ? 'この動画を読み込めませんでした。別の形式へ変換してからお試しください'
    : '動画の読み込みに時間がかかりすぎました。別の形式へ変換してからお試しください';
}

function minutesOf(ms: number): number {
  return Math.round(ms / 60_000);
}

export function AnalysisPanel({
  phase,
  progress,
  summary,
  params,
  failure,
  warning,
  onCancel,
  onChangeParams,
}: AnalysisPanelProps) {
  const scanning = phase === 'scanning';
  const percent = Math.round(progress.ratio * 100);

  return (
    <section className={styles.panel} data-testid="analysis-panel">
      <h2 className={styles.heading}>解析</h2>

      {warning !== null && (
        <p className={styles.warning} data-testid="analysis-warning">
          尺が {minutesOf(warning.durationMs)} 分あります（推奨は{' '}
          {minutesOf(warning.maxMs)} 分まで）。走査に時間がかかります
        </p>
      )}

      {failure !== null && (
        <p className={styles.failure} data-testid="analysis-failure">
          {describeFailure(failure)}
        </p>
      )}

      <div className={styles.progressRow}>
        <div
          className={styles.track}
          role="progressbar"
          aria-label="走査の進捗"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
        <span className={styles.ratio} data-testid="analysis-ratio">
          {percent}%
        </span>
        <span className={styles.elapsed} data-testid="analysis-elapsed">
          {(progress.elapsedMs / 1000).toFixed(1)} 秒
        </span>
        <button
          type="button"
          className={styles.cancel}
          onClick={onCancel}
          disabled={!scanning}
          aria-label="走査をキャンセル"
        >
          キャンセル
        </button>
      </div>

      <label className={styles.param}>
        <span className={styles.paramLabel}>
          ブースト急減の閾値
          <span className={styles.paramValue} data-testid="boost-threshold-value">
            {params.boostDropThreshold}
          </span>
          <span className={styles.paramDefault} data-testid="boost-threshold-default">
            既定 {DEFAULT_ANALYSIS_PARAMS.boostDropThreshold}
          </span>
        </span>
        <input
          className={styles.slider}
          type="range"
          aria-label="ブースト急減の閾値"
          min={BOOST_THRESHOLD_MIN}
          max={BOOST_THRESHOLD_MAX}
          step={BOOST_THRESHOLD_STEP}
          value={params.boostDropThreshold}
          onChange={(event) =>
            // 触っていない項目まで既定へ戻さないよう、変えた 1 つだけを差し替える
            onChangeParams({ ...params, boostDropThreshold: Number(event.target.value) })
          }
        />
      </label>

      {summary !== null && (
        <div className={styles.summary}>
          <p className={styles.total} data-testid="detection-total">
            検出 {summary.total} 件
          </p>
          <ul className={styles.counts} data-testid="detection-counts">
            {Object.entries(summary.countsByInput).map(([input, count]) => (
              <li key={input} className={styles.count}>
                <span>{inputLabel(input)}</span>
                <span className={styles.countValue}>{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
