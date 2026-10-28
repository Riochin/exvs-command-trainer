/**
 * 再生方式のフレーム供給（既定）。
 *
 * 倍速再生しながら `requestVideoFrameCallback` で「実際に提示されたフレーム」を
 * 受け取る。コマ送りのシークを繰り返すより桁違いに速く、60 秒 1080p を
 * 現実的な時間で走査できる（Req 5.5）。
 *
 * 倍速再生では当然フレームが飛ぶ。飛んだことを隠さず `skippedFrames` として
 * 添えるのがこの方式の要で、上位層はそれを欠測区間として扱える（Req 3.1）。
 *
 * 動画要素は解析専用のものを受け取り、以後この供給が所有する。閲覧用の要素とは
 * 共有しない。共有すると走査中にユーザーのスクラブと再生位置を奪い合う（Req 5.6）。
 */
import type { FrameHandle, FrameSource } from './types';

export type PlaybackFrameSourceInput = {
  /** 解析専用の（非表示の）動画要素。dispose で片付ける */
  readonly video: HTMLVideoElement;
  readonly durationMs: number;
  readonly frameDurationMs: number;
  /** 走査の再生倍率 */
  readonly playbackRate: number;
};

/** rVFC が返した 1 枚ぶんの情報。終端・中断では null */
type PresentedFrame = { readonly tMs: number; readonly presentedFrames: number } | null;

export function createPlaybackFrameSource(input: PlaybackFrameSourceInput): FrameSource {
  const { video, durationMs, frameDurationMs, playbackRate } = input;

  /** 次に提示されるフレームを待つ。終端・中断でも必ず解決する */
  function waitNextFrame(signal: AbortSignal): Promise<PresentedFrame> {
    return new Promise<PresentedFrame>((resolve) => {
      let settled = false;

      const finish = (frame: PresentedFrame): void => {
        if (settled) return;
        settled = true;
        video.cancelVideoFrameCallback(handle);
        video.removeEventListener('ended', onEnded);
        signal.removeEventListener('abort', onAbort);
        resolve(frame);
      };

      const onEnded = (): void => finish(null);
      const onAbort = (): void => finish(null);

      const handle = video.requestVideoFrameCallback((_now, metadata) =>
        finish({
          tMs: metadata.mediaTime * 1000,
          presentedFrames: metadata.presentedFrames,
        }),
      );
      video.addEventListener('ended', onEnded);
      signal.addEventListener('abort', onAbort);
    });
  }

  async function* frames(signal: AbortSignal): AsyncIterable<FrameHandle> {
    if (signal.aborted) return;

    video.playbackRate = playbackRate;
    await video.play();

    let lastPresentedFrames: number | null = null;
    let lastTMs = Number.NEGATIVE_INFINITY;

    try {
      while (!signal.aborted) {
        const frame = await waitNextFrame(signal);
        if (frame === null) return;

        // 提示済み枚数の増分が 1 を超えた分だけ、観測できずに飛んだフレームがある
        const skippedFrames =
          lastPresentedFrames === null
            ? 0
            : Math.max(0, frame.presentedFrames - lastPresentedFrames - 1);
        lastPresentedFrames = frame.presentedFrames;

        // 単調非減少の保証。逆行したフレームは観測として使えないので捨てる
        if (frame.tMs < lastTMs) continue;
        lastTMs = frame.tMs;

        yield { tMs: frame.tMs, source: video, skippedFrames };
      }
    } finally {
      // 中断でも終端でも、走査用の再生は必ず止める
      video.pause();
    }
  }

  function dispose(): void {
    video.pause();
    video.removeAttribute('src');
    // デコーダに解放を伝える。src を外しただけでは保持され続ける
    video.load();
    video.remove();
  }

  return { kind: 'playback', durationMs, frameDurationMs, frames, dispose };
}
