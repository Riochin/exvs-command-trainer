/**
 * 校正から出力までの通し検証。
 *
 * jsdom には動画のデコードも canvas もないため、フレーム供給と画素取り出しだけを
 * 擬似実装へ差し替える。それ以外（校正の作図・走査の駆動・グリフのラベル付け・
 * 一覧への反映・ファイル出力）は本番と同じ配線を通す。
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CHART_FORMAT_VERSION } from '@/types/chart';
import {
  currentHarness,
  lastDownloadText,
  loadVideo,
  renderApp,
  SCAN_FRAME_MS,
  stepRows,
} from '../features/chart-author/appHarness';
import { tick, type FrameLook } from '../features/chart-author/analysis-run/fakeScan';

/** 動画の表示サイズ。正規化座標への換算はこの箱を基準にする */
const STAGE = { left: 0, top: 0, width: 800, height: 450 };

/** 弾数表示が途中で別の見え方に変わる。数字の意味は後からラベルで与える */
const AMMO_CHANGE_FRAME = 3;
const ammoLook = (index: number): FrameLook => ({
  ink: index < AMMO_CHANGE_FRAME ? 'top' : 'bottom',
});

function mockStageBounds(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...STAGE,
    right: STAGE.width,
    bottom: STAGE.height,
    x: STAGE.left,
    y: STAGE.top,
    toJSON: () => ({}),
  } as DOMRect);
}

function dragOnStage(from: readonly [number, number], to: readonly [number, number]): void {
  const layer = screen.getByTestId('calibration-overlay');
  fireEvent.mouseDown(layer, { clientX: from[0], clientY: from[1] });
  fireEvent.mouseMove(window, { clientX: to[0], clientY: to[1] });
  fireEvent.mouseUp(window, { clientX: to[0], clientY: to[1] });
}

/** 弾数領域とブーストゲージを描いて、解析を開始できる校正にする */
function drawCalibration(): void {
  dragOnStage([80, 45], [240, 135]);
  fireEvent.click(screen.getByRole('button', { name: 'ブーストゲージを描く' }));
  dragOnStage([400, 200], [600, 260]);
}

/** フレームを順に流し切る。供給の終端まで届けて走査を終わらせる */
async function harnessDeliver(frames: number): Promise<void> {
  const source = currentHarness().frameSource;
  await source.deliverMany(frames, SCAN_FRAME_MS);
  await source.finish();
}

function phaseOf(): string | undefined {
  return screen.getByTestId('chart-author-app').dataset.phase;
}

/** 未解決グリフへ、現れた順に数字を与える */
function labelGlyphs(digits: readonly number[]): void {
  const rows = within(screen.getByTestId('glyph-tutor')).getAllByRole('listitem');
  digits.forEach((digit, index) => {
    const buttons = within(rows[index]).getAllByRole('button');
    fireEvent.click(buttons[digit]);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mockStageBounds();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('譜面作成の通し（校正 → 走査 → ラベル付け → 一覧 → 出力）', () => {
  it('校正から出力まで一通り進み、期待どおりの時刻と入力種別の譜面が出る', async () => {
    renderApp(ammoLook);
    await loadVideo();

    // --- 校正 -------------------------------------------------------------
    expect(phaseOf()).toBe('calibrating');
    expect((screen.getByTestId('calibration-start') as HTMLButtonElement).disabled).toBe(true);

    drawCalibration();

    expect(screen.getAllByTestId('calibration-rect').length).toBeGreaterThanOrEqual(2);
    expect((screen.getByTestId('calibration-start') as HTMLButtonElement).disabled).toBe(false);

    // --- 走査 -------------------------------------------------------------
    await act(async () => {
      fireEvent.click(screen.getByTestId('calibration-start'));
      await tick();
    });

    expect(phaseOf()).toBe('scanning');
    expect(screen.getByRole('progressbar', { name: '走査の進捗' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '走査をキャンセル' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    await act(async () => {
      await harnessDeliver(6);
    });

    // --- グリフのラベル付け -----------------------------------------------
    expect(phaseOf()).toBe('resolving');
    expect(screen.getByTestId('glyph-tutor')).toBeTruthy();

    // 先に現れたクラスタが 2、あとのクラスタが 1。弾数が 22 → 11 に減る
    act(() => labelGlyphs([2, 1]));

    // --- 一覧 -------------------------------------------------------------
    expect(phaseOf()).toBe('editing');
    expect(screen.getByTestId('analysis-ratio').textContent).toBe('100%');

    const rows = stepRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('00:00.300');
    expect(rows[0].textContent).toContain('射撃');
    expect(rows[0].textContent).toContain('自動');

    // --- 出力 -------------------------------------------------------------
    fireEvent.click(screen.getByRole('button', { name: 'JSON をダウンロード' }));
    const chart = JSON.parse(await lastDownloadText());

    expect(chart.version).toBe(CHART_FORMAT_VERSION);
    expect(chart.steps).toHaveLength(1);
    expect(chart.steps[0]).toMatchObject({
      tMs: AMMO_CHANGE_FRAME * SCAN_FRAME_MS,
      input: 'shot',
      origin: 'auto',
    });
    expect(chart.steps[0].confidence).toBeGreaterThan(0);
    expect(chart.steps[0].confidence).toBeLessThanOrEqual(1);
  });

  it('数字が未解決のうちは譜面へ入れず、ラベルの内容どおりに判定する', async () => {
    renderApp(ammoLook);
    await loadVideo();
    drawCalibration();

    await act(async () => {
      fireEvent.click(screen.getByTestId('calibration-start'));
      await tick();
    });
    await act(async () => {
      await harnessDeliver(6);
    });

    // 未解決の桁を推測で埋めない。この段階では譜面に何も入れない
    expect(phaseOf()).toBe('resolving');
    expect(stepRows()).toHaveLength(0);

    // 先のクラスタが 1、あとが 2。弾数が 11 → 22 と増える（リロード）
    act(() => labelGlyphs([1, 2]));

    expect(phaseOf()).toBe('editing');
    expect(stepRows()).toHaveLength(0);
  });
});


