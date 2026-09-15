'use client';

/**
 * 選択中ステップの手直しと、譜面全体のオフセット。
 *
 * 一覧で見つけた 1 件を直す場所。時刻の微調整はコマ単位に限り、任意の数値を
 * 打たせない（Req 7.4）。種別の選択肢は既存の入力種別だけを並べ、ここから
 * 新しい種別が生まれないようにする（Req 7.5）。
 */
import { useState } from 'react';
import { isButtonType } from '@/types';
import type { ButtonType } from '@/types';
import { INPUT_LABELS, INPUT_TYPES } from '../inputLabels';
import { formatTimecode } from '../player/timecode';
import type { EditorStep } from '../types';
import { candidateReason, ORIGIN_LABELS } from './stepDisplay';
import styles from './StepInspector.module.css';

export type StepInspectorProps = {
  /** 選択中のステップ。選択がなければ null */
  readonly step: EditorStep | null;
  readonly canUndo: boolean;
  onRemove(id: string): void;
  onNudge(id: string, frames: number): void;
  onChangeInput(id: string, input: ButtonType): void;
  onApplyGlobalOffset(offsetMs: number): void;
  onUndo(): void;
};

export function StepInspector({
  step,
  canUndo,
  onRemove,
  onNudge,
  onChangeInput,
  onApplyGlobalOffset,
  onUndo,
}: StepInspectorProps) {
  // 入力途中の文字列をそのまま持つ。適用まで譜面には触れない
  const [offsetText, setOffsetText] = useState('');

  const offsetMs = Number(offsetText);
  const offsetReady = offsetText.trim() !== '' && Number.isFinite(offsetMs);
  const reason = step === null ? null : candidateReason(step);

  return (
    <section className={styles.panel} data-testid="step-inspector">
      <h2 className={styles.heading}>選択中のステップ</h2>

      {step === null ? (
        <p className={styles.empty} data-testid="step-inspector-empty">
          一覧かタイムラインからステップを選ぶと編集できます
        </p>
      ) : (
        <>
          <dl className={styles.summary}>
            <div className={styles.field}>
              <dt className={styles.term}>時刻</dt>
              <dd className={styles.value}>{formatTimecode(step.tMs)}</dd>
            </div>
            <div className={styles.field}>
              <dt className={styles.term}>信頼度</dt>
              <dd className={styles.value}>{step.confidence.toFixed(2)}</dd>
            </div>
            <div className={styles.field}>
              <dt className={styles.term}>由来</dt>
              <dd className={styles.value}>{ORIGIN_LABELS[step.origin]}</dd>
            </div>
          </dl>

          {reason !== null && <p className={styles.candidate}>要確認 / {reason}</p>}

          <label className={styles.control}>
            <span className={styles.term}>入力種別</span>
            <select
              className={styles.select}
              aria-label="入力種別"
              value={step.input}
              onChange={(event) => {
                // 選択肢は既存の種別だけだが、値の出所を型で絞ってから渡す
                if (isButtonType(event.target.value)) onChangeInput(step.id, event.target.value);
              }}
            >
              {INPUT_TYPES.map((input) => (
                <option key={input} value={input}>
                  {INPUT_LABELS[input]}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              aria-label="1 コマ前へ"
              onClick={() => onNudge(step.id, -1)}
            >
              ◀| 1 コマ
            </button>
            <button
              type="button"
              className={styles.button}
              aria-label="1 コマ後ろへ"
              onClick={() => onNudge(step.id, 1)}
            >
              1 コマ |▶
            </button>
            <button
              type="button"
              className={styles.danger}
              aria-label="選択中のステップを削除"
              onClick={() => onRemove(step.id)}
            >
              削除
            </button>
          </div>
        </>
      )}

      <div className={styles.offset}>
        <label className={styles.control}>
          <span className={styles.term}>編集オフセット</span>
          <input
            type="number"
            className={styles.number}
            aria-label="編集オフセット（ミリ秒）"
            step={1}
            value={offsetText}
            onChange={(event) => setOffsetText(event.target.value)}
          />
          <span className={styles.unit}>ms</span>
        </label>
        <button
          type="button"
          className={styles.button}
          disabled={!offsetReady}
          onClick={() => onApplyGlobalOffset(offsetMs)}
        >
          譜面全体をずらす
        </button>
        <p className={styles.note} data-testid="offset-note">
          譜面そのものを動かします。出力時の時刻補正とは別の設定です
        </p>
      </div>

      <button type="button" className={styles.button} disabled={!canUndo} onClick={onUndo}>
        直前の操作を取り消す
      </button>
    </section>
  );
}
