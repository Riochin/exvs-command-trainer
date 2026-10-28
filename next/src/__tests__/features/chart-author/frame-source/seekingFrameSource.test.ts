import { describe, it, expect } from 'vitest';
import { createSeekingFrameSource } from '@/features/chart-author/frame-source/seekingFrameSource';
import { createPlaybackFrameSource } from '@/features/chart-author/frame-source/playbackFrameSource';
import type { FrameHandle } from '@/features/chart-author/frame-source/types';
import { FRAME_DURATION_MS } from '@/features/chart-author/constants';
import { createFakeVideo, tick, waitForSeek } from './fakeVideo';
import type { FakeVideo } from './fakeVideo';

function setup(fake: FakeVideo, durationMs: number) {
  return createSeekingFrameSource({
    video: fake.video,
    durationMs,
    frameDurationMs: FRAME_DURATION_MS,
  });
}

function consume(
  source: ReturnType<typeof setup>,
  signal: AbortSignal,
  onFrame?: (frame: FrameHandle, received: FrameHandle[]) => void,
): { received: FrameHandle[]; done: Promise<void> } {
  const received: FrameHandle[] = [];
  const done = (async () => {
    for await (const frame of source.frames(signal)) {
      received.push(frame);
      onFrame?.(frame, received);
    }
  })();
  return { received, done };
}

describe('seekingFrameSource / 供給の契約', () => {
  it('シーク方式であることと動画の諸元を公開する', () => {
    const source = setup(createFakeVideo(), 60_000);

    expect(source.kind).toBe('seeking');
    expect(source.durationMs).toBe(60_000);
    expect(source.frameDurationMs).toBe(FRAME_DURATION_MS);
  });

  it('再生方式と同じ形の契約を満たす', () => {
    const seeking = setup(createFakeVideo(), 1000);
    const playback = createPlaybackFrameSource({
      video: createFakeVideo().video,
      durationMs: 1000,
      frameDurationMs: FRAME_DURATION_MS,
      playbackRate: 4,
    });

    expect(Object.keys(seeking).sort()).toEqual(Object.keys(playback).sort());
  });

  it('再生方式と同じ手順で最後まで消費できる', async () => {
    const fake = createFakeVideo({ autoSeeked: true });
    const source = setup(fake, 100);
    const { received, done } = consume(source, new AbortController().signal);

    await done;

    expect(received.map((frame) => Math.round(frame.tMs))).toEqual([0, 33, 67]);
    expect(received.every((frame) => frame.source === fake.video)).toBe(true);
  });
});

describe('seekingFrameSource / コマ送りの進め方', () => {
  it('再生位置をコマ単位で進める', async () => {
    const fake = createFakeVideo({ autoSeeked: true });
    const { done } = consume(setup(fake, 100), new AbortController().signal);

    await done;

    expect(fake.seeks.map((seconds) => Math.round(seconds * 1000))).toEqual([0, 33, 67]);
  });

  it('再生はせず、シークだけで進める', async () => {
    const fake = createFakeVideo({ autoSeeked: true });
    const { done } = consume(setup(fake, 100), new AbortController().signal);

    await done;

    expect(fake.play).not.toHaveBeenCalled();
  });

  it('シークの完了を待ってからフレームを供給する', async () => {
    const fake = createFakeVideo();
    const controller = new AbortController();
    const { received, done } = consume(setup(fake, 10_000), controller.signal);

    await waitForSeek(fake, 1);
    expect(received).toHaveLength(0);

    fake.emitSeeked();
    await tick();
    expect(received).toHaveLength(1);

    controller.abort();
    fake.emitSeeked();
    await done;
  });

  it('コマ送りなので取りこぼしは起きない', async () => {
    const fake = createFakeVideo({ autoSeeked: true });
    const { received, done } = consume(setup(fake, 200), new AbortController().signal);

    await done;

    expect(received.every((frame) => frame.skippedFrames === 0)).toBe(true);
  });

  it('尺を越えたら供給を終える', async () => {
    const fake = createFakeVideo({ autoSeeked: true });
    const { received, done } = consume(setup(fake, 100), new AbortController().signal);

    await done;

    expect(received).toHaveLength(3);
    expect(received[received.length - 1].tMs).toBeLessThan(100);
  });

  it('尺が 0 なら 1 枚も供給しない', async () => {
    const fake = createFakeVideo({ autoSeeked: true });
    const { received, done } = consume(setup(fake, 0), new AbortController().signal);

    await done;

    expect(received).toHaveLength(0);
  });
});

describe('seekingFrameSource / 中断', () => {
  it('中断要求で速やかに供給を終える', async () => {
    const fake = createFakeVideo({ autoSeeked: true });
    const controller = new AbortController();
    const { received, done } = consume(setup(fake, 10_000), controller.signal, (_frame, all) => {
      if (all.length === 2) controller.abort();
    });

    await done;

    expect(received).toHaveLength(2);
  });

  it('中断済みの signal では 1 枚も供給しない', async () => {
    const fake = createFakeVideo({ autoSeeked: true });
    const controller = new AbortController();
    controller.abort();

    const { received, done } = consume(setup(fake, 10_000), controller.signal);
    await done;

    expect(received).toHaveLength(0);
    expect(fake.seeks).toHaveLength(0);
  });

  it('シーク待ちの最中に中断されても終われる', async () => {
    const fake = createFakeVideo();
    const controller = new AbortController();
    const { received, done } = consume(setup(fake, 10_000), controller.signal);

    await waitForSeek(fake, 1);
    controller.abort();
    await done;

    expect(received).toHaveLength(0);
  });
});

describe('seekingFrameSource / 後片付け', () => {
  it('dispose で解析用の要素を片付ける', async () => {
    const fake = createFakeVideo();
    document.body.appendChild(fake.video);
    fake.video.setAttribute('src', 'blob:analysis');
    const source = setup(fake, 1000);

    source.dispose();
    await tick();

    expect(fake.video.isConnected).toBe(false);
    expect(fake.video.getAttribute('src')).toBeNull();
  });

  it('閲覧用の動画要素の再生位置に触れない', async () => {
    const viewing = createFakeVideo();
    viewing.video.currentTime = 12.5;
    const analysis = createFakeVideo({ autoSeeked: true });
    const { done } = consume(setup(analysis, 100), new AbortController().signal);

    await done;

    expect(viewing.video.currentTime).toBe(12.5);
    expect(viewing.seeks).toEqual([12.5]);
  });
});
