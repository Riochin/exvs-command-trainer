/**
 * シーク方式のフレーム供給（フォールバック）。
 *
 * `requestVideoFrameCallback` が無い環境では、提示されたフレームを知る術がない。
 * 代わりに再生位置をコマ単位で進め、`seeked` を待ってから次へ進む。
 * シーク 1 回ごとにデコードが走るため再生方式より大幅に遅いが、
 * 走査する時刻を自分で決められるのでフレームの取りこぼしは起きない。
 *
 * 供給の契約は再生方式と同一で、呼び出し側は方式を意識しない（Req 5.5 の退避路）。
 */
import type { FrameHandle, FrameSource } from './types';

export type SeekingFrameSourceInput = {
  /** 解析専用の（非表示の）動画要素。dispose で片付ける */
  readonly video: HTMLVideoElement;
  readonly durationMs: number;
  readonly frameDurationMs: number;
};

export function createSeekingFrameSource(input: SeekingFrameSourceInput): FrameSource {
  const { video, durationMs, frameDurationMs } = input;

  /** シーク完了を待つ。中断されたら false を返す */
  function waitSeeked(signal: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;

      const finish = (seeked: boolean): void => {
        if (settled) return;
        settled = true;
        video.removeEventListener('seeked', onSeeked);
        signal.removeEventListener('abort', onAbort);
        resolve(seeked);
      };

      const onSeeked = (): void => finish(true);
      const onAbort = (): void => finish(false);

      video.addEventListener('seeked', onSeeked);
      signal.addEventListener('abort', onAbort);
    });
  }

  async function* frames(signal: AbortSignal): AsyncIterable<FrameHandle> {
    if (signal.aborted) return;

    for (let tMs = 0; tMs < durationMs; tMs += frameDurationMs) {
      // 待ち受けを張ってからシークする。seeked を取りこぼさない順序
      const seeked = waitSeeked(signal);
      video.currentTime = tMs / 1000;

      if (!(await seeked)) return;
      if (signal.aborted) return;

      // 走査する時刻をこちらが決めているので、飛ばされたフレームは存在しない
      yield { tMs, source: video, skippedFrames: 0 };
    }
  }

  function dispose(): void {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }

  return { kind: 'seeking', durationMs, frameDurationMs, frames, dispose };
}
