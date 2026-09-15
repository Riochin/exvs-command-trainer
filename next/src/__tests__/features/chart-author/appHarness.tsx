/**
 * ChartAuthorApp の結合テストが共有する足場。
 *
 * jsdom には動画のデコードも canvas もないので、ツールが外界に触れる 3 点
 * （Object URL・検証用 video・フレーム供給）だけを差し替える。ツール内部の
 * 配線には手を入れず、画面の操作だけで筋書きを進められるようにする。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ChartAuthorApp } from '@/features/chart-author/ChartAuthorApp';
import { CALIBRATION_STORAGE_KEY } from '@/features/chart-author/constants';
import type { HudCalibration } from '@/features/chart-author/types';
import { calibrationOf, slot, VIDEO_KEY } from './analysis/helpers';
import { createFakeSampler, createManualFrameSource, tick, type FrameLook } from './analysis-run/fakeScan';
import { createFakeVideo, type FakeVideo } from './frame-source/fakeVideo';

export { VIDEO_KEY };

/** 走査のフレーム間隔。既定のブースト時間窓（100ms）と合わせる */
export const SCAN_FRAME_MS = 100;

export type AppHarness = {
  readonly frameSource: ReturnType<typeof createManualFrameSource>;
  readonly probes: FakeVideo[];
  readonly revoked: string[];
  /** createObjectURL に渡された Blob。ダウンロードの中身をここから読む */
  readonly blobs: Blob[];
};

let harness: AppHarness;

export function currentHarness(): AppHarness {
  return harness;
}

/** 弾数は空のまま、ブーストだけが途中で急減する見え方 */
export function boostDropLook(dropAtFrame = 3): (index: number) => FrameLook {
  return (index) => ({ boostFill: index < dropAtFrame ? 1 : 0.4 });
}

export function installUrlMocks(): void {
  let issued = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn((blob: Blob) => {
      issued += 1;
      harness.blobs.push(blob);
      return `blob:mock-${issued}`;
    }),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn((url: string) => void harness.revoked.push(url)),
    writable: true,
    configurable: true,
  });
}

/** 同名ファイルの校正を保存済みにしておく。校正の作図を経ずに解析まで進める */
export function seedReusableCalibration(calibration: HudCalibration = calibrationOf([slot()])): void {
  window.localStorage.setItem(
    CALIBRATION_STORAGE_KEY,
    JSON.stringify({ [calibration.videoKey.fileName]: calibration }),
  );
}

export function renderApp(look: (index: number) => FrameLook = boostDropLook()) {
  const frameSource = createManualFrameSource({
    durationMs: VIDEO_KEY.durationMs,
    frameDurationMs: SCAN_FRAME_MS,
  });
  const sampler = createFakeSampler(look);
  const probes: FakeVideo[] = [];

  harness = { frameSource, probes, revoked: [], blobs: [] };
  installUrlMocks();

  const view = render(
    <ChartAuthorApp
      videoOptions={{
        createProbeVideo: () => {
          const fake = createFakeVideo({ durationSeconds: VIDEO_KEY.durationMs / 1000 });
          probes.push(fake);
          return fake.video;
        },
      }}
      analysisDeps={{
        openFrameSource: async () => ({ ok: true as const, source: frameSource.source }),
        createSampler: () => sampler,
        yieldToMain: async () => {},
      }}
    />,
  );

  return { ...view, harness };
}

export function videoFile(name = VIDEO_KEY.fileName): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'video/mp4' });
}

/** 動画を選び、検証用 video に結末を流して読み込みを終わらせる */
export async function loadVideo(
  outcome: 'loaded' | 'error' = 'loaded',
  file: File = videoFile(),
): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('動画ファイル'), { target: { files: [file] } });
    const probe = harness.probes[harness.probes.length - 1];
    if (outcome === 'loaded') probe.emitLoadedMetadata();
    else probe.emitError();
    await tick();
  });
}

/** 保存済みの校正を採用して、解析を開始できる状態にする */
export function adoptSavedCalibration(): void {
  fireEvent.click(screen.getByRole('button', { name: '保存済みの校正を使う' }));
}

/** 解析を開始し、フレームを流し切って編集の段階まで進める */
export async function runAnalysis(frames = 6): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('calibration-start'));
    await tick();
  });
  await act(async () => {
    await harness.frameSource.deliverMany(frames, SCAN_FRAME_MS);
    await harness.frameSource.finish();
  });
}

/** アーケードコントローラのデバッグキーで手動ステップを 1 件足す */
export async function pressControllerShot(): Promise<void> {
  fireEvent.keyDown(window, { key: 'f' });
  fireEvent.keyUp(window, { key: 'f' });
  // 同時押し判定の遅延（50ms）を実時間で越えさせる
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

export function phaseOf(): string | undefined {
  return screen.getByTestId('chart-author-app').dataset.phase;
}

export function stepRows(): HTMLElement[] {
  return screen.queryAllByTestId('step-row');
}

/** 直近のダウンロードの中身。ファイルを作らずに内容だけを確かめる */
export async function lastDownloadText(): Promise<string> {
  const blob = harness.blobs[harness.blobs.length - 1];
  if (blob === undefined) throw new Error('ダウンロードが発生していません');
  return blob.text();
}

export function lastDownloadType(): string {
  const blob = harness.blobs[harness.blobs.length - 1];
  if (blob === undefined) throw new Error('ダウンロードが発生していません');
  return blob.type;
}
