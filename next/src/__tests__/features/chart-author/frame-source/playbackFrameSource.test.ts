import { describe, it, expect } from 'vitest';
import { createPlaybackFrameSource } from '@/features/chart-author/frame-source/playbackFrameSource';
import type { FrameHandle } from '@/features/chart-author/frame-source/types';
import { FRAME_DURATION_MS } from '@/features/chart-author/constants';
import { createFakeVideo, pushFrame, tick, waitForFrameRequest } from './fakeVideo';
import type { FakeVideo } from './fakeVideo';

const DURATION_MS = 60_000;

function setup(fake: FakeVideo, playbackRate = 4) {
  return createPlaybackFrameSource({
    video: fake.video,
    durationMs: DURATION_MS,
    frameDurationMs: FRAME_DURATION_MS,
    playbackRate,
  });
}

/** 供給を裏で回しながら、受け取ったフレームを集める */
function consume(
  source: ReturnType<typeof setup>,
  signal: AbortSignal,
): { received: FrameHandle[]; done: Promise<void> } {
  const received: FrameHandle[] = [];
  const done = (async () => {
    for await (const frame of source.frames(signal)) received.push(frame);
  })();
  return { received, done };
}

describe('playbackFrameSource / 供給の契約', () => {
  it('再生方式であることと動画の諸元を公開する', () => {
    const source = setup(createFakeVideo());

    expect(source.kind).toBe('playback');
    expect(source.durationMs).toBe(DURATION_MS);
    expect(source.frameDurationMs).toBe(FRAME_DURATION_MS);
  });

  it('再生倍率を上げてから再生を始める', async () => {
    const fake = createFakeVideo();
    const source = setup(fake, 4);
    const controller = new AbortController();
    const { done } = consume(source, controller.signal);

    await waitForFrameRequest(fake);

    expect(fake.video.playbackRate).toBe(4);
    expect(fake.play).toHaveBeenCalled();

    controller.abort();
    await done;
  });

  it('フレームのメディア時刻を ms で供給する', async () => {
    const fake = createFakeVideo();
    const source = setup(fake);
    const controller = new AbortController();
    const { received, done } = consume(source, controller.signal);

    await pushFrame(fake, 0, 1);
    await pushFrame(fake, 1000, 2);
    fake.emitEnded();
    await done;

    expect(received.map((frame) => frame.tMs)).toEqual([0, 1000]);
    expect(received[0].source).toBe(fake.video);
  });

  it('時刻は単調非減少で、逆行したフレームは捨てる', async () => {
    const fake = createFakeVideo();
    const source = setup(fake);
    const controller = new AbortController();
    const { received, done } = consume(source, controller.signal);

    await pushFrame(fake, 1000, 1);
    await pushFrame(fake, 500, 2);
    await pushFrame(fake, 1500, 3);
    fake.emitEnded();
    await done;

    expect(received.map((frame) => frame.tMs)).toEqual([1000, 1500]);
  });
});

describe('playbackFrameSource / 取りこぼしの算出', () => {
  it('最初のフレームは取りこぼし 0 とする', async () => {
    const fake = createFakeVideo();
    const source = setup(fake);
    const controller = new AbortController();
    const { received, done } = consume(source, controller.signal);

    await pushFrame(fake, 0, 7);
    fake.emitEnded();
    await done;

    expect(received[0].skippedFrames).toBe(0);
  });

  it('提示済みフレーム数の増分から飛ばされた枚数を出す', async () => {
    const fake = createFakeVideo();
    const source = setup(fake);
    const controller = new AbortController();
    const { received, done } = consume(source, controller.signal);

    await pushFrame(fake, 0, 1);
    await pushFrame(fake, 100, 2);
    await pushFrame(fake, 200, 5);
    fake.emitEnded();
    await done;

    expect(received.map((frame) => frame.skippedFrames)).toEqual([0, 0, 2]);
  });
});

describe('playbackFrameSource / 終了と中断', () => {
  it('動画の終端で供給を終える', async () => {
    const fake = createFakeVideo();
    const source = setup(fake);
    const controller = new AbortController();
    const { received, done } = consume(source, controller.signal);

    await pushFrame(fake, 0, 1);
    await waitForFrameRequest(fake);
    fake.emitEnded();
    await done;

    expect(received).toHaveLength(1);
  });

  it('中断要求で速やかに供給を終える', async () => {
    const fake = createFakeVideo();
    const source = setup(fake);
    const controller = new AbortController();
    const { received, done } = consume(source, controller.signal);

    await pushFrame(fake, 0, 1);
    await waitForFrameRequest(fake);
    controller.abort();
    await done;

    expect(received).toHaveLength(1);
  });

  it('中断済みの signal では 1 枚も供給しない', async () => {
    const fake = createFakeVideo();
    const source = setup(fake);
    const controller = new AbortController();
    controller.abort();

    const { received, done } = consume(source, controller.signal);
    await done;

    expect(received).toHaveLength(0);
  });

  it('終了時に再生を止め、保留中のフレーム待ちを解除する', async () => {
    const fake = createFakeVideo();
    const source = setup(fake);
    const controller = new AbortController();
    const { done } = consume(source, controller.signal);

    await pushFrame(fake, 0, 1);
    await waitForFrameRequest(fake);
    controller.abort();
    await done;

    expect(fake.pause).toHaveBeenCalled();
    expect(fake.pendingFrameCallbacks()).toBe(0);
  });
});

describe('playbackFrameSource / 閲覧用要素からの独立', () => {
  it('閲覧用の動画要素の再生位置に触れない', async () => {
    const viewing = createFakeVideo();
    viewing.video.currentTime = 12.5;
    const analysis = createFakeVideo();
    const source = setup(analysis);
    const controller = new AbortController();
    const { done } = consume(source, controller.signal);

    await pushFrame(analysis, 0, 1);
    await pushFrame(analysis, 1000, 2);
    controller.abort();
    await done;

    expect(viewing.video.currentTime).toBe(12.5);
    expect(viewing.play).not.toHaveBeenCalled();
    expect(viewing.seeks).toEqual([12.5]);
  });

  it('dispose で解析用の要素を片付ける', async () => {
    const fake = createFakeVideo();
    document.body.appendChild(fake.video);
    fake.video.setAttribute('src', 'blob:analysis');
    const source = setup(fake);

    source.dispose();
    await tick();

    expect(fake.pause).toHaveBeenCalled();
    expect(fake.video.isConnected).toBe(false);
    expect(fake.video.getAttribute('src')).toBeNull();
  });
});
