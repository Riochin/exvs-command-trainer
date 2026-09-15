'use client';

/**
 * 閲覧用の動画表示と、その上に重ねる領域。
 *
 * 校正の矩形は動画の表示サイズに合わせて重ねる必要があるので、動画と
 * オーバーレイを同じ箱に収め、その箱の大きさを動画の実寸ではなく
 * アスペクト比で決める。解析用の要素はここには現れない（別に持つ）。
 */
import type { ReactNode, RefObject } from 'react';
import type { VideoKey } from '../types';
import { formatTimecode } from './timecode';
import styles from './VideoStage.module.css';

export type VideoStageProps = {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly objectUrl: string | null;
  readonly videoKey: VideoKey | null;
  /** 動画の上に重ねる要素（校正オーバーレイなど） */
  readonly children?: ReactNode;
};

export function VideoStage({ videoRef, objectUrl, videoKey, children }: VideoStageProps) {
  if (objectUrl === null || videoKey === null) {
    return (
      <div className={styles.stage}>
        <p className={styles.placeholder} data-testid="video-placeholder">
          動画ファイル（mp4 / mov）を読み込んでください
        </p>
      </div>
    );
  }

  return (
    <div className={styles.stage}>
      <div
        className={styles.frame}
        style={{ aspectRatio: `${videoKey.width} / ${videoKey.height}` }}
      >
        <video
          ref={videoRef}
          className={styles.video}
          data-testid="chart-author-video"
          src={objectUrl}
          // 音は解析にも確認にも要らない。自動再生の制約も避けられる
          muted
          playsInline
          preload="auto"
        />
        {children}
      </div>

      <p className={styles.meta} data-testid="video-meta">
        {videoKey.fileName} / {formatTimecode(videoKey.durationMs)} /{' '}
        {videoKey.width}×{videoKey.height}
      </p>
    </div>
  );
}
