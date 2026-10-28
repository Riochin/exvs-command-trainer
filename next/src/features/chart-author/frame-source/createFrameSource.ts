/**
 * 供給方式を能力検出で選ぶファクトリ。
 *
 * 呼び出し側は方式を知らないまま `FrameSource` を受け取る。ここが、
 * rVFC の有無という環境差を 1 箇所に閉じ込める境界。
 *
 * 解析専用の動画要素を作るのもここ。閲覧用の要素とは別物を用意し、
 * 走査がユーザーの再生位置に干渉しないようにする（Req 5.6）。
 */
import {
  DEFAULT_SCAN_PLAYBACK_RATE,
  FRAME_DURATION_MS,
  METADATA_TIMEOUT_MS,
} from '../constants';
import { createPlaybackFrameSource } from './playbackFrameSource';
import { createSeekingFrameSource } from './seekingFrameSource';
import type { FrameSource } from './types';

export type CreateFrameSourceInput = {
  readonly objectUrl: string;
  /** 走査の再生倍率。playback 方式でのみ意味を持つ。既定は DEFAULT_SCAN_PLAYBACK_RATE */
  readonly playbackRate?: number;
};

export type CreateFrameSourceResult =
  | { readonly ok: true; readonly source: FrameSource }
  | { readonly ok: false; readonly reason: 'decode_failed' | 'metadata_timeout' };

/** 環境と要素の作り方を差し替えるための口。テストはここへフェイクを渡す */
export type CreateFrameSourceDeps = {
  readonly createVideo?: () => HTMLVideoElement;
  readonly supportsFrameCallback?: () => boolean;
};

/**
 * 解析専用の動画要素を作る。
 *
 * `display: none` にはしない。表示されない要素はフレームが提示されず、
 * rVFC が一度も呼ばれなくなるため。画面外の 1px として置く。
 */
export function createAnalysisVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  // 自動再生をユーザー操作なしで通すために消音が要る
  video.muted = true;
  video.preload = 'metadata';
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.style.position = 'fixed';
  video.style.left = '-9999px';
  video.style.top = '0';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  return video;
}

/** 解析用の要素を完全に手放す */
function discard(video: HTMLVideoElement): void {
  video.removeAttribute('src');
  video.load();
  video.remove();
}

type MetadataOutcome = 'loaded' | 'decode_failed' | 'metadata_timeout';

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

function defaultSupportsFrameCallback(): boolean {
  return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}

export async function createFrameSource(
  input: CreateFrameSourceInput,
  deps: CreateFrameSourceDeps = {},
): Promise<CreateFrameSourceResult> {
  const createVideo = deps.createVideo ?? createAnalysisVideoElement;
  const supportsFrameCallback = deps.supportsFrameCallback ?? defaultSupportsFrameCallback;

  const video = createVideo();
  video.setAttribute('src', input.objectUrl);

  const outcome = await waitMetadata(video);
  if (outcome !== 'loaded') {
    discard(video);
    return { ok: false, reason: outcome };
  }

  const durationMs = video.duration * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    // 尺が読めない動画は走査の進捗も終端も決められない
    discard(video);
    return { ok: false, reason: 'decode_failed' };
  }

  const source = supportsFrameCallback()
    ? createPlaybackFrameSource({
        video,
        durationMs,
        frameDurationMs: FRAME_DURATION_MS,
        playbackRate: input.playbackRate ?? DEFAULT_SCAN_PLAYBACK_RATE,
      })
    : createSeekingFrameSource({ video, durationMs, frameDurationMs: FRAME_DURATION_MS });

  return { ok: true, source };
}
