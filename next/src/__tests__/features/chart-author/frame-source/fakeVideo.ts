/**
 * フレーム供給層のテストが使う動画要素のフェイク。
 *
 * jsdom は再生もデコードも rVFC も実装しないので、供給層が触る口だけを
 * 差し替えて「いつフレームが来たか」をテストから制御できるようにする。
 */
import { vi } from 'vitest';

export type FakeVideo = {
  readonly video: HTMLVideoElement;
  /** 未処理の rVFC 登録数 */
  pendingFrameCallbacks(): number;
  /** 提示フレームを 1 枚流す */
  emitFrame(mediaTimeMs: number, presentedFrames: number): void;
  /** 終端に達したことを伝える */
  emitEnded(): void;
  /** シーク完了を伝える */
  emitSeeked(): void;
  /** currentTime へ書かれた値の履歴（秒） */
  readonly seeks: number[];
  readonly play: ReturnType<typeof vi.fn>;
  readonly pause: ReturnType<typeof vi.fn>;
  readonly load: ReturnType<typeof vi.fn>;
};

/** マイクロタスクとタイマーを 1 巡させる */
export async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 供給側が次のフレームを待ち始めるまで待つ */
export async function waitForFrameRequest(fake: FakeVideo): Promise<void> {
  for (let attempt = 0; attempt < 50 && fake.pendingFrameCallbacks() === 0; attempt += 1) {
    await tick();
  }
  if (fake.pendingFrameCallbacks() === 0) {
    throw new Error('rVFC が登録されませんでした');
  }
}

/** 供給側が n 回目のシークを要求するまで待つ */
export async function waitForSeek(fake: FakeVideo, count: number): Promise<void> {
  for (let attempt = 0; attempt < 50 && fake.seeks.length < count; attempt += 1) {
    await tick();
  }
  if (fake.seeks.length < count) {
    throw new Error(`${count} 回目のシークが要求されませんでした`);
  }
}

/** 登録を待ってからフレームを 1 枚流す */
export async function pushFrame(
  fake: FakeVideo,
  mediaTimeMs: number,
  presentedFrames: number,
): Promise<void> {
  await waitForFrameRequest(fake);
  fake.emitFrame(mediaTimeMs, presentedFrames);
  await tick();
}

export type FakeVideoOptions = {
  readonly videoWidth?: number;
  readonly videoHeight?: number;
  /** true なら rVFC を生やさない（シーク方式のフォールバック検証用） */
  readonly withoutFrameCallback?: boolean;
  /** currentTime を書いたら自動で seeked を発火する */
  readonly autoSeeked?: boolean;
};

export function createFakeVideo(options: FakeVideoOptions = {}): FakeVideo {
  const video = document.createElement('video');
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  const seeks: number[] = [];
  let nextHandle = 1;
  let currentTime = 0;

  Object.defineProperty(video, 'videoWidth', { value: options.videoWidth ?? 1920 });
  Object.defineProperty(video, 'videoHeight', { value: options.videoHeight ?? 1080 });

  const fake: FakeVideo = {
    video,
    seeks,
    play: vi.fn(async () => {}),
    pause: vi.fn(() => {}),
    load: vi.fn(() => {}),
    pendingFrameCallbacks: () => callbacks.size,
    emitFrame(mediaTimeMs, presentedFrames) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) {
        callback(0, {
          mediaTime: mediaTimeMs / 1000,
          presentedFrames,
          presentationTime: 0,
          expectedDisplayTime: 0,
          width: options.videoWidth ?? 1920,
          height: options.videoHeight ?? 1080,
        });
      }
    },
    emitEnded: () => void video.dispatchEvent(new Event('ended')),
    emitSeeked: () => void video.dispatchEvent(new Event('seeked')),
  };

  video.play = fake.play as unknown as HTMLVideoElement['play'];
  video.pause = fake.pause as unknown as HTMLVideoElement['pause'];
  video.load = fake.load as unknown as HTMLVideoElement['load'];

  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
      seeks.push(value);
      if (options.autoSeeked === true) {
        // 実ブラウザの seeked は非同期に来る
        setTimeout(() => fake.emitSeeked(), 0);
      }
    },
    configurable: true,
  });

  if (options.withoutFrameCallback !== true) {
    video.requestVideoFrameCallback = (callback: VideoFrameRequestCallback): number => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    };
    video.cancelVideoFrameCallback = (handle: number): void => {
      callbacks.delete(handle);
    };
  }

  return fake;
}
