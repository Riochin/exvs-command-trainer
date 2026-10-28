'use client';

/**
 * 再生・一時停止・シーク・コマ送りの操作列と、常時表示の再生位置。
 *
 * キーボードの割り当ては `ArcadeController` のデバッグキー（f / y / i）を
 * 避ける。ツールの画面ではコントローラを手動ラベル付けに使うため、両者が
 * 同じ window の keydown を見ていても取り合いにならない組み合わせにする。
 */
import { useEffect } from 'react';
import { formatTimecode } from './timecode';
import styles from './TransportBar.module.css';

/** コマ送りのキーと移動量。ArcadeController の f / y / i とは重ならない */
export const FRAME_STEP_KEYS: Readonly<Record<string, number>> = {
  ',': -1,
  '.': 1,
};

/** 再生と一時停止を切り替えるキー */
export const PLAY_TOGGLE_KEY = ' ';

export type TransportBarProps = {
  readonly currentTimeMs: number;
  readonly durationMs: number;
  readonly isPlaying: boolean;
  /** 動画が読み込まれていない間は操作もショートカットも無効にする */
  readonly disabled: boolean;
  onPlay(): void;
  onPause(): void;
  onSeek(tMs: number): void;
  onStepFrame(delta: number): void;
};

/** 文字入力中のキーは奪わない。テキスト欄で `.` が打てなくなるのを避ける */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]') !== null) {
    return true;
  }
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function TransportBar({
  currentTimeMs,
  durationMs,
  isPlaying,
  disabled,
  onPlay,
  onPause,
  onSeek,
  onStepFrame,
}: TransportBarProps) {
  useEffect(() => {
    if (disabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || isEditableTarget(event.target)) return;

      const delta = FRAME_STEP_KEYS[event.key];
      if (delta !== undefined) {
        event.preventDefault();
        onStepFrame(delta);
        return;
      }

      if (event.key === PLAY_TOGGLE_KEY) {
        // 既定のままだと直前に押したボタンが再度押され、ページも下へ流れる
        event.preventDefault();
        if (isPlaying) onPause();
        else onPlay();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, isPlaying, onPause, onPlay, onStepFrame]);

  return (
    <div className={styles.bar} data-testid="transport-bar">
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          onClick={() => onStepFrame(-1)}
          disabled={disabled}
          aria-label="1 コマ戻る"
          title="1 コマ戻る（,）"
        >
          ◀|
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={isPlaying ? onPause : onPlay}
          disabled={disabled}
          aria-label={isPlaying ? '一時停止' : '再生'}
          title={isPlaying ? '一時停止（Space）' : '再生（Space）'}
        >
          {isPlaying ? '❙❙' : '▶'}
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => onStepFrame(1)}
          disabled={disabled}
          aria-label="1 コマ進む"
          title="1 コマ進む（.）"
        >
          |▶
        </button>
      </div>

      <output className={styles.timecode} data-testid="transport-timecode">
        {formatTimecode(currentTimeMs)}
      </output>

      <input
        className={styles.seek}
        type="range"
        min={0}
        max={Math.max(0, Math.round(durationMs))}
        step={1}
        value={Math.min(Math.round(currentTimeMs), Math.max(0, Math.round(durationMs)))}
        disabled={disabled}
        aria-label="再生位置"
        onChange={(event) => onSeek(Number(event.target.value))}
      />

      <span className={styles.hint}>, / . でコマ送り・Space で再生</span>
    </div>
  );
}
