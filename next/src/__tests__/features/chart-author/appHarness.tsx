/**
 * ChartAuthorApp の結合テストが共有する足場。
 *
 * jsdom には動画のデコードも canvas もないので、ツールが外界に触れる 3 点
 * （Object URL・検証用 video・フレーム供給）だけを差し替える。ツール内部の
 * 配線には手を入れず、画面の操作だけで筋書きを進められるようにする。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { ChartAuthorApp } from '@/features/chart-author/ChartAuthorApp';
import { CALIBRATION_STORAGE_KEY } from '@/features/chart-author/constants';
import type { HudCalibration } from '@/features/chart-author/types';
import { calibrationOf, slot, VIDEO_KEY } from './analysis/helpers';
import {
  createFakeSampler,
  createManualFrameSource,
  tick,
  type FrameLook,
  type ManualFrameSource,
} from './analysis-run/fakeScan';
import { createFakeVideo, type FakeVideo } from './frame-source/fakeVideo';

export { VIDEO_KEY };

/** 走査のフレーム間隔。既定のブースト時間窓（100ms）と合わせる */
export const SCAN_FRAME_MS = 100;

export type AppHarness = {
  /** 走査のたびに開かれる擬似フレーム供給。再解析では新しい 1 本が積まれる */
  readonly sources: readonly ManualFrameSource[];
  /** 最後に開かれた供給。テストはこれにフレームを流す */
  readonly frameSource: ManualFrameSource;
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

/** 弾数表示が途中で別の見え方に変わる。クラスタが 2 つでき、ラベル付けが要る */
export function ammoChangeLook(changeAtFrame = 3): (index: number) => FrameLook {
  return (index) => ({ ink: index < changeAtFrame ? 'top' : 'bottom' });
}

/** 動画の表示サイズ。正規化座標への換算はこの箱を基準にする */
export const STAGE_BOUNDS = { left: 0, top: 0, width: 800, height: 450 };

/** jsdom は要素の大きさを持たないので、動画の表示領域を与える */
export function mockStageBounds(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...STAGE_BOUNDS,
    right: STAGE_BOUNDS.width,
    bottom: STAGE_BOUNDS.height,
    x: STAGE_BOUNDS.left,
    y: STAGE_BOUNDS.top,
    toJSON: () => ({}),
  } as DOMRect);
}

/** 表示座標でのドラッグを再現する。mockStageBounds が要る */
export function dragOnStage(
  from: readonly [number, number],
  to: readonly [number, number],
): void {
  const layer = screen.getByTestId('calibration-overlay');
  fireEvent.mouseDown(layer, { clientX: from[0], clientY: from[1] });
  fireEvent.mouseMove(window, { clientX: to[0], clientY: to[1] });
  fireEvent.mouseUp(window, { clientX: to[0], clientY: to[1] });
}

/** 弾数領域とブーストゲージを描いて、解析を開始できる校正にする */
export function drawCalibration(): void {
  dragOnStage([80, 45], [240, 135]);
  fireEvent.click(screen.getByRole('button', { name: 'ブーストゲージを描く' }));
  dragOnStage([400, 200], [600, 260]);
}

/** 未解決グリフへ、現れた順に数字を与える */
export function labelGlyphs(digits: readonly number[]): void {
  const rows = within(screen.getByTestId('glyph-tutor')).getAllByRole('listitem');
  digits.forEach((digit, index) => {
    const buttons = within(rows[index]).getAllByRole('button');
    fireEvent.click(buttons[digit]);
  });
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
  const sampler = createFakeSampler(look);
  const probes: FakeVideo[] = [];
  // 走査は始まるたびに新しい供給を開く。再解析でも同じ手順でフレームを流せる
  const sources: ManualFrameSource[] = [];

  harness = {
    sources,
    get frameSource(): ManualFrameSource {
      const latest = sources[sources.length - 1];
      if (latest === undefined) throw new Error('フレーム供給がまだ開かれていません');
      return latest;
    },
    probes,
    revoked: [],
    blobs: [],
  };
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
        openFrameSource: async () => {
          const opened = createManualFrameSource({
            durationMs: VIDEO_KEY.durationMs,
            frameDurationMs: SCAN_FRAME_MS,
          });
          sources.push(opened);
          return { ok: true as const, source: opened.source };
        },
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

/** いま開かれている供給へフレームを流し切る */
export async function deliverScanFrames(frames = 6): Promise<void> {
  await act(async () => {
    const source = harness.frameSource;
    await source.deliverMany(frames, SCAN_FRAME_MS);
    await source.finish();
  });
}

/** 解析を開始し、走査が始まるところまで進める */
export async function startAnalysis(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('calibration-start'));
    await tick();
  });
}

/** 解析を開始し、フレームを流し切って編集の段階まで進める */
export async function runAnalysis(frames = 6): Promise<void> {
  await startAnalysis();
  await deliverScanFrames(frames);
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
