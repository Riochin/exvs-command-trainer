import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useVideoController } from '@/features/chart-author/player/useVideoController';
import type { VideoLoadResult } from '@/features/chart-author/player/useVideoController';
import { FRAME_DURATION_MS, METADATA_TIMEOUT_MS } from '@/features/chart-author/constants';
import { createFakeVideo, type FakeVideo } from '../frame-source/fakeVideo';

/** createObjectURL に渡された Blob と、発行・破棄された URL の履歴 */
type UrlLog = {
  blobs: Blob[];
  created: string[];
  revoked: string[];
};

const urls: UrlLog = { blobs: [], created: [], revoked: [] };

/** loadFile が作る検証用 video。テストからイベントを流せるよう差し替える */
let probes: FakeVideo[] = [];

function nextProbe(options: Parameters<typeof createFakeVideo>[0] = {}): HTMLVideoElement {
  const fake = createFakeVideo(options);
  probes.push(fake);
  return fake.video;
}

function renderController(probeOptions: Parameters<typeof createFakeVideo>[0] = {}) {
  return renderHook(() =>
    useVideoController({ createProbeVideo: () => nextProbe(probeOptions) }),
  );
}

function videoFile(name = 'clip.mp4', type = 'video/mp4'): File {
  return new File([new Uint8Array([0, 1, 2, 3])], name, { type });
}

beforeEach(() => {
  urls.blobs = [];
  urls.created = [];
  urls.revoked = [];
  probes = [];

  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn((blob: Blob) => {
      urls.blobs.push(blob);
      const url = `blob:mock-${urls.blobs.length}`;
      urls.created.push(url);
      return url;
    }),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn((url: string) => void urls.revoked.push(url)),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** 読み込みを開始し、指定の結末を検証用 video に流して解決させる */
async function loadWith(
  controller: { current: ReturnType<typeof useVideoController> },
  file: File,
  outcome: 'loaded' | 'error',
): Promise<VideoLoadResult> {
  let loaded: VideoLoadResult | null = null;
  await act(async () => {
    const pending = controller.current.loadFile(file);
    const probe = probes[probes.length - 1];
    if (outcome === 'loaded') probe.emitLoadedMetadata();
    else probe.emitError();
    loaded = await pending;
  });
  if (loaded === null) throw new Error('loadFile が解決しませんでした');
  return loaded;
}

describe('useVideoController - 読み込み', () => {
  it('動画を読み込むと尺と解像度が得られる', async () => {
    const { result } = renderController({
      durationSeconds: 12.5,
      videoWidth: 1920,
      videoHeight: 1080,
    });

    const loaded = await loadWith(result, videoFile('battle.mp4'), 'loaded');

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.videoKey).toEqual({
      fileName: 'battle.mp4',
      durationMs: 12_500,
      width: 1920,
      height: 1080,
    });
    expect(result.current.videoKey).toEqual(loaded.videoKey);
    expect(result.current.objectUrl).toBe(loaded.objectUrl);
  });

  it('ファイルをブラウザ内の Object URL として扱い、どこへも送信しない', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderController();

    await loadWith(result, videoFile(), 'loaded');

    expect(urls.created).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('QuickTime 形式は内容を変えずに一般的な動画として読み直す', async () => {
    const { result } = renderController();

    await loadWith(result, videoFile('capture.mov', 'video/quicktime'), 'loaded');

    expect(urls.blobs).toHaveLength(1);
    expect(urls.blobs[0].type).toBe('video/mp4');
    // 内容は変えない。元ファイルと同じ長さであること
    expect(urls.blobs[0].size).toBe(4);
  });

  it('デコードできないファイルはファイル名つきの失敗を返す', async () => {
    const { result } = renderController();

    const loaded = await loadWith(result, videoFile('broken.mp4'), 'error');

    expect(loaded).toEqual({ ok: false, fileName: 'broken.mp4', reason: 'decode_failed' });
  });

  it('メタデータを待ちきれない場合はデコード失敗と区別して返す', async () => {
    vi.useFakeTimers();
    const { result } = renderController();

    let loaded: VideoLoadResult | null = null;
    await act(async () => {
      const pending = result.current.loadFile(videoFile('slow.mp4'));
      await vi.advanceTimersByTimeAsync(METADATA_TIMEOUT_MS + 1);
      loaded = await pending;
    });

    expect(loaded).toEqual({ ok: false, fileName: 'slow.mp4', reason: 'metadata_timeout' });
  });

  it('尺が読み取れない動画はデコード失敗として扱う', async () => {
    const { result } = renderController({ durationSeconds: Number.NaN });

    const loaded = await loadWith(result, videoFile('noduration.mp4'), 'loaded');

    expect(loaded).toEqual({
      ok: false,
      fileName: 'noduration.mp4',
      reason: 'decode_failed',
    });
  });

  it('読み込みに失敗しても直前に読み込まれていた動画の状態を変えない', async () => {
    const { result } = renderController();

    const first = await loadWith(result, videoFile('good.mp4'), 'loaded');
    const failed = await loadWith(result, videoFile('bad.mp4'), 'error');

    expect(failed.ok).toBe(false);
    expect(result.current.videoKey).toEqual(first.ok ? first.videoKey : null);
    expect(result.current.objectUrl).toBe(first.ok ? first.objectUrl : null);
  });

  it('読み込みに失敗したときは確保した参照を破棄する', async () => {
    const { result } = renderController();

    await loadWith(result, videoFile('bad.mp4'), 'error');

    expect(urls.revoked).toEqual([urls.created[0]]);
  });

  it('新しい動画を読み込むと古い参照を破棄する', async () => {
    const { result } = renderController();

    const first = await loadWith(result, videoFile('a.mp4'), 'loaded');
    await loadWith(result, videoFile('b.mp4'), 'loaded');

    expect(urls.revoked).toEqual([first.ok ? first.objectUrl : '']);
  });
});

describe('useVideoController - 再生制御', () => {
  /** 閲覧用の要素を差し込んだ状態の controller を返す */
  async function loadedController(durationSeconds = 10) {
    const rendered = renderController({ durationSeconds });
    const stage = createFakeVideo({ durationSeconds });
    rendered.result.current.videoRef.current = stage.video;
    await loadWith(rendered.result, videoFile(), 'loaded');
    return { ...rendered, stage };
  }

  it('ミリ秒でのシークを提供する', async () => {
    const { result, stage } = await loadedController();

    act(() => result.current.seekTo(1234));

    expect(stage.seeks[stage.seeks.length - 1]).toBeCloseTo(1.234, 5);
    expect(result.current.currentTimeMs).toBeCloseTo(1234, 5);
  });

  it('シーク先を動画の範囲に収める', async () => {
    const { result } = await loadedController(10);

    act(() => result.current.seekTo(-500));
    expect(result.current.currentTimeMs).toBe(0);

    act(() => result.current.seekTo(99_999));
    expect(result.current.currentTimeMs).toBe(10_000);
  });

  it('再生と一時停止を提供する', async () => {
    const { result, stage } = await loadedController();

    act(() => result.current.play());
    expect(stage.play).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(true);

    act(() => result.current.pause());
    expect(stage.pause).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('コマ送りを 1/30 秒単位で前後に行う', async () => {
    const { result } = await loadedController();

    act(() => result.current.seekTo(1000));
    act(() => result.current.stepFrame(1));
    expect(result.current.currentTimeMs).toBeCloseTo(1000 + FRAME_DURATION_MS, 5);

    act(() => result.current.stepFrame(-2));
    expect(result.current.currentTimeMs).toBeCloseTo(1000 - FRAME_DURATION_MS, 5);
  });

  it('コマ送りの移動先が動画の範囲を超えない', async () => {
    const { result } = await loadedController(10);

    act(() => result.current.seekTo(0));
    act(() => result.current.stepFrame(-1));
    expect(result.current.currentTimeMs).toBe(0);

    act(() => result.current.seekTo(10_000));
    act(() => result.current.stepFrame(1));
    expect(result.current.currentTimeMs).toBe(10_000);
  });

  it('コマ送りは再生を止めてから移動する', async () => {
    const { result, stage } = await loadedController();

    act(() => result.current.play());
    act(() => result.current.stepFrame(1));

    expect(stage.pause).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('動画側の再生位置の変化を取り込む', async () => {
    const { result, stage } = await loadedController();

    act(() => {
      stage.video.currentTime = 3.5;
      stage.video.dispatchEvent(new Event('timeupdate'));
    });

    expect(result.current.currentTimeMs).toBeCloseTo(3500, 5);
  });

  it('読み込んだ動画の参照を解放できる', async () => {
    const { result } = await loadedController();
    const created = urls.created[urls.created.length - 1];

    act(() => result.current.release());

    expect(urls.revoked).toContain(created);
    expect(result.current.objectUrl).toBeNull();
    expect(result.current.videoKey).toBeNull();
    expect(result.current.currentTimeMs).toBe(0);
  });
});
