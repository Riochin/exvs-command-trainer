import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createAnalysisVideoElement,
  createFrameSource,
} from '@/features/chart-author/frame-source/createFrameSource';
import {
  DEFAULT_SCAN_PLAYBACK_RATE,
  FRAME_DURATION_MS,
  METADATA_TIMEOUT_MS,
} from '@/features/chart-author/constants';
import { createFakeVideo, tick, waitForFrameRequest } from './fakeVideo';
import type { FakeVideo } from './fakeVideo';

const OBJECT_URL = 'blob:analysis-clip';

/** メタデータ待ちを解決させながらファクトリを呼ぶ */
async function createWith(
  fake: FakeVideo,
  overrides: {
    supportsFrameCallback?: boolean;
    playbackRate?: number;
    settle?: 'metadata' | 'error' | 'none';
  } = {},
) {
  const pending = createFrameSource(
    { objectUrl: OBJECT_URL, playbackRate: overrides.playbackRate },
    {
      createVideo: () => fake.video,
      supportsFrameCallback: () => overrides.supportsFrameCallback ?? true,
    },
  );

  await tick();
  if (overrides.settle === 'error') fake.emitError();
  else if (overrides.settle !== 'none') fake.emitLoadedMetadata();

  return pending;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createFrameSource / 能力検出', () => {
  it('フレーム描画の通知が使える環境では再生方式を選ぶ', async () => {
    const result = await createWith(createFakeVideo(), { supportsFrameCallback: true });

    expect(result.ok).toBe(true);
    expect(result.ok && result.source.kind).toBe('playback');
  });

  it('使えない環境ではシーク方式を選ぶ', async () => {
    const fake = createFakeVideo({ withoutFrameCallback: true });
    const result = await createWith(fake, { supportsFrameCallback: false });

    expect(result.ok && result.source.kind).toBe('seeking');
  });

  it('既定の能力検出は video 要素の実装を見る', () => {
    // jsdom は rVFC を実装しないので、この環境ではシーク方式が選ばれる
    expect('requestVideoFrameCallback' in HTMLVideoElement.prototype).toBe(false);
  });
});

describe('createFrameSource / メタデータの待機', () => {
  it('メタデータが読めるまで結果を返さない', async () => {
    const fake = createFakeVideo();
    let settled = false;
    const pending = createFrameSource(
      { objectUrl: OBJECT_URL },
      { createVideo: () => fake.video, supportsFrameCallback: () => true },
    ).then((result) => {
      settled = true;
      return result;
    });

    await tick();
    expect(settled).toBe(false);

    fake.emitLoadedMetadata();
    await pending;

    expect(settled).toBe(true);
  });

  it('読み込んだ尺とコマ送りの単位を供給へ渡す', async () => {
    const fake = createFakeVideo({ durationSeconds: 42 });
    const result = await createWith(fake);

    expect(result.ok && result.source.durationMs).toBe(42_000);
    expect(result.ok && result.source.frameDurationMs).toBe(FRAME_DURATION_MS);
  });

  it('読み込む動画の場所を要素へ渡す', async () => {
    const fake = createFakeVideo();
    await createWith(fake);

    expect(fake.video.getAttribute('src')).toBe(OBJECT_URL);
  });
});

describe('createFrameSource / 失敗の区別', () => {
  it('デコード失敗は decode_failed として返す', async () => {
    const result = await createWith(createFakeVideo(), { settle: 'error' });

    expect(result).toEqual({ ok: false, reason: 'decode_failed' });
  });

  it('待機が尽きたら metadata_timeout として返す', async () => {
    vi.useFakeTimers();
    const fake = createFakeVideo();
    const pending = createFrameSource(
      { objectUrl: OBJECT_URL },
      { createVideo: () => fake.video, supportsFrameCallback: () => true },
    );

    await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS);

    expect(await pending).toEqual({ ok: false, reason: 'metadata_timeout' });
  });

  it('尺が読めない動画は decode_failed として返す', async () => {
    const fake = createFakeVideo({ durationSeconds: Number.NaN });
    const result = await createWith(fake);

    expect(result).toEqual({ ok: false, reason: 'decode_failed' });
  });

  it('失敗したときは解析用の要素を片付ける', async () => {
    const fake = createFakeVideo();
    document.body.appendChild(fake.video);

    await createWith(fake, { settle: 'error' });

    expect(fake.video.isConnected).toBe(false);
    expect(fake.video.getAttribute('src')).toBeNull();
  });
});

describe('createFrameSource / 再生倍率', () => {
  it('指定がなければ既定の倍率で走査する', async () => {
    const fake = createFakeVideo();
    const result = await createWith(fake);
    if (!result.ok) throw new Error('作成に失敗しました');

    const controller = new AbortController();
    const frames = result.source.frames(controller.signal)[Symbol.asyncIterator]();
    const first = frames.next();
    await waitForFrameRequest(fake);

    expect(fake.video.playbackRate).toBe(DEFAULT_SCAN_PLAYBACK_RATE);

    controller.abort();
    await first;
  });

  it('指定された倍率を使う', async () => {
    const fake = createFakeVideo();
    const result = await createWith(fake, { playbackRate: 2 });
    if (!result.ok) throw new Error('作成に失敗しました');

    const controller = new AbortController();
    const frames = result.source.frames(controller.signal)[Symbol.asyncIterator]();
    const first = frames.next();
    await waitForFrameRequest(fake);

    expect(fake.video.playbackRate).toBe(2);

    controller.abort();
    await first;
  });
});

describe('createAnalysisVideoElement / 解析専用の要素', () => {
  it('音を出さずに自動再生できる設定にする', () => {
    const video = createAnalysisVideoElement();

    expect(video.muted).toBe(true);
    expect(video.getAttribute('playsinline')).not.toBeNull();
  });

  it('画面に見えないが描画はされる置き方にする', () => {
    const video = createAnalysisVideoElement();

    // display:none にするとフレームが提示されず rVFC が来なくなる
    expect(video.style.display).not.toBe('none');
    expect(video.getAttribute('aria-hidden')).toBe('true');
    expect(video.style.position).toBe('fixed');
  });
});
