'use client';

/**
 * 閲覧用 `<video>` の読み込み・再生・シーク・コマ送り。
 *
 * 動画ファイルはブラウザの外へ出さない（Req 1.2）。ここが行うのは
 * Object URL の発行と解放だけで、ネットワークには一切触れない。
 *
 * 読み込みの可否は閲覧用の要素ではなく使い捨ての検証用要素で確かめる。
 * 閲覧用の要素に直接 src を当ててから失敗を知ると、その時点で前の動画は
 * すでに失われている。前の状態を保ったままエラーを返す（Req 1.3）ために、
 * 「読めると分かってから差し替える」という順序をここで固定する。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FRAME_DURATION_MS, METADATA_TIMEOUT_MS } from '../constants';
import type { VideoKey } from '../types';

export type VideoLoadFailureReason = 'decode_failed' | 'metadata_timeout';

export type VideoLoadResult =
  | { readonly ok: true; readonly videoKey: VideoKey; readonly objectUrl: string }
  | {
      readonly ok: false;
      readonly fileName: string;
      readonly reason: VideoLoadFailureReason;
    };

export interface UseVideoControllerReturn {
  readonly videoRef: React.RefObject<HTMLVideoElement | null>;
  readonly videoKey: VideoKey | null;
  readonly objectUrl: string | null;
  readonly currentTimeMs: number;
  readonly isPlaying: boolean;
  loadFile(file: File): Promise<VideoLoadResult>;
  play(): void;
  pause(): void;
  seekTo(tMs: number): void;
  stepFrame(delta: number): void;
  release(): void;
}

export type UseVideoControllerOptions = {
  /** 読み込み可否を確かめる使い捨ての要素。省略時は自前で作る。テストはフェイクを渡す */
  readonly createProbeVideo?: () => HTMLVideoElement;
};

/** `.mov` の MIME。主要ブラウザはこの型のままでは再生を拒む */
const QUICKTIME_MIME = 'video/quicktime';

/** 付け替え先。コンテナは同じなので中身を変えずに扱い直せる */
const PLAYABLE_MIME = 'video/mp4';

function isQuickTime(file: File): boolean {
  return file.type === QUICKTIME_MIME || /\.mov$/i.test(file.name);
}

/**
 * 再生できる形の Blob にする。
 *
 * `.mov` は `File.type` が `video/quicktime` になり Chrome / Firefox が
 * 再生を拒む。中身は触らず MIME だけを付け替える。Blob は元の Blob を
 * 参照するだけなので、ここでファイル全体を読むことはない。
 */
function toPlayableBlob(file: File): Blob {
  return isQuickTime(file) ? new Blob([file], { type: PLAYABLE_MIME }) : file;
}

function createDefaultProbeVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'metadata';
  video.setAttribute('playsinline', '');
  return video;
}

/** 検証用の要素を完全に手放す */
function discardProbe(video: HTMLVideoElement): void {
  video.removeAttribute('src');
  video.load();
}

type MetadataOutcome = 'loaded' | VideoLoadFailureReason;

function waitMetadata(video: HTMLVideoElement): Promise<MetadataOutcome> {
  return new Promise<MetadataOutcome>((resolve) => {
    let settled = false;

    const finish = (outcome: MetadataOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      resolve(outcome);
    };

    const onLoaded = (): void => finish('loaded');
    const onError = (): void => finish('decode_failed');
    // 読めない動画で永久に待たされないための上限。デコード失敗とは区別して返す
    const timer = setTimeout(() => finish('metadata_timeout'), METADATA_TIMEOUT_MS);

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
  });
}

/** メタデータを読めた要素から同一性の照合キーを組み立てる。尺が取れなければ null */
function videoKeyOf(fileName: string, video: HTMLVideoElement): VideoKey | null {
  const durationMs = video.duration * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return {
    fileName,
    durationMs,
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

export function useVideoController(
  options: UseVideoControllerOptions = {},
): UseVideoControllerReturn {
  const createProbeVideo = options.createProbeVideo ?? createDefaultProbeVideo;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoKey, setVideoKey] = useState<VideoKey | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  /** 解放すべき Object URL。state と別に持つのは、片付けが再描画を待てないため */
  const heldUrlRef = useRef<string | null>(null);
  /** シークのクランプに使う尺。コールバックを state に依存させないため ref で持つ */
  const durationMsRef = useRef(0);

  const loadFile = useCallback(
    async (file: File): Promise<VideoLoadResult> => {
      const candidateUrl = URL.createObjectURL(toPlayableBlob(file));
      const probe = createProbeVideo();
      probe.setAttribute('src', candidateUrl);

      const outcome = await waitMetadata(probe);
      const key = outcome === 'loaded' ? videoKeyOf(file.name, probe) : null;
      discardProbe(probe);

      if (key === null) {
        // ここまでで確保したものはすべて捨てる。既存の動画には触れていない
        URL.revokeObjectURL(candidateUrl);
        return {
          ok: false,
          fileName: file.name,
          reason: outcome === 'loaded' ? 'decode_failed' : outcome,
        };
      }

      if (heldUrlRef.current !== null) URL.revokeObjectURL(heldUrlRef.current);
      heldUrlRef.current = candidateUrl;
      durationMsRef.current = key.durationMs;

      setVideoKey(key);
      setObjectUrl(candidateUrl);
      setCurrentTimeMs(0);
      setIsPlaying(false);

      return { ok: true, videoKey: key, objectUrl: candidateUrl };
    },
    [createProbeVideo],
  );

  const play = useCallback(() => {
    const video = videoRef.current;
    if (video === null) return;
    void video.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (video === null) return;
    video.pause();
    setIsPlaying(false);
  }, []);

  const seekTo = useCallback((tMs: number) => {
    const target = clamp(tMs, durationMsRef.current);
    const video = videoRef.current;
    if (video !== null) video.currentTime = target / 1000;
    setCurrentTimeMs(target);
  }, []);

  /** コマ送りは常に静止画の比較のための操作なので、再生中でも必ず止めてから動かす */
  const stepFrame = useCallback(
    (delta: number) => {
      pause();
      setCurrentTimeMs((previous) => {
        const target = clamp(previous + delta * FRAME_DURATION_MS, durationMsRef.current);
        const video = videoRef.current;
        if (video !== null) video.currentTime = target / 1000;
        return target;
      });
    },
    [pause],
  );

  const release = useCallback(() => {
    const video = videoRef.current;
    if (video !== null) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (heldUrlRef.current !== null) {
      URL.revokeObjectURL(heldUrlRef.current);
      heldUrlRef.current = null;
    }
    durationMsRef.current = 0;
    setVideoKey(null);
    setObjectUrl(null);
    setCurrentTimeMs(0);
    setIsPlaying(false);
  }, []);

  /**
   * 動画側で起きた再生位置の変化を取り込む。
   * 操作は seekTo / stepFrame を通るとは限らず、ネイティブの操作でも動く。
   */
  useEffect(() => {
    const video = videoRef.current;
    if (video === null || objectUrl === null) return;

    const syncTime = (): void => setCurrentTimeMs(video.currentTime * 1000);
    const onPlay = (): void => setIsPlaying(true);
    const onPause = (): void => setIsPlaying(false);

    video.addEventListener('timeupdate', syncTime);
    video.addEventListener('seeked', syncTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onPause);

    return () => {
      video.removeEventListener('timeupdate', syncTime);
      video.removeEventListener('seeked', syncTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onPause);
    };
  }, [objectUrl]);

  // 画面を離れるときに Object URL を取り残さない
  useEffect(
    () => () => {
      if (heldUrlRef.current !== null) {
        URL.revokeObjectURL(heldUrlRef.current);
        heldUrlRef.current = null;
      }
    },
    [],
  );

  return {
    videoRef,
    videoKey,
    objectUrl,
    currentTimeMs,
    isPlaying,
    loadFile,
    play,
    pause,
    seekTo,
    stepFrame,
    release,
  };
}
