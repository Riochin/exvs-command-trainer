/**
 * 校正から出力までの通し検証。
 *
 * jsdom には動画のデコードも canvas もないため、フレーム供給と画素取り出しだけを
 * 擬似実装へ差し替える。それ以外（校正の作図・走査の駆動・グリフのラベル付け・
 * 一覧への反映・ファイル出力）は本番と同じ配線を通す。
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CHART_FORMAT_VERSION } from '@/types/chart';
import {
  ammoChangeLook,
  deliverScanFrames,
  drawCalibration,
  labelGlyphs,
  lastDownloadText,
  loadVideo,
  mockStageBounds,
  phaseOf,
  renderApp,
  SCAN_FRAME_MS,
  startAnalysis,
  stepRows,
} from '../features/chart-author/appHarness';

/** 弾数表示が変わるフレーム。数字の意味は後からラベルで与える */
const AMMO_CHANGE_FRAME = 3;
const ammoLook = ammoChangeLook(AMMO_CHANGE_FRAME);

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
    await startAnalysis();

    expect(phaseOf()).toBe('scanning');
    expect(screen.getByRole('progressbar', { name: '走査の進捗' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '走査をキャンセル' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    await deliverScanFrames(6);

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

    await startAnalysis();
    await deliverScanFrames(6);

    // 未解決の桁を推測で埋めない。この段階では譜面に何も入れない
    expect(phaseOf()).toBe('resolving');
    expect(stepRows()).toHaveLength(0);

    // 先のクラスタが 1、あとが 2。弾数が 11 → 22 と増える（リロード）
    act(() => labelGlyphs([1, 2]));

    expect(phaseOf()).toBe('editing');
    expect(stepRows()).toHaveLength(0);
  });
});


