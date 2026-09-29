/**
 * 校正の永続化と再利用の検証（Req 2.6）。
 *
 * 校正は矩形を描くのに一番手間がかかる。同じ動画・同じ配信者の別クリップで
 * 描き直しを強いられないよう、校正が完了した時点で保存し、次に同じファイル名を
 * 読んだら再利用を提案する。
 */
import { fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CALIBRATION_STORAGE_KEY } from '@/features/chart-author/constants';
import type { HudCalibration } from '@/features/chart-author/types';
import {
  ammoChangeLook,
  deliverScanFrames,
  drawCalibration,
  labelGlyphs,
  loadVideo,
  mockStageBounds,
  renderApp,
  startAnalysis,
  VIDEO_KEY,
} from '../features/chart-author/appHarness';

function storedCalibrations(): Record<string, HudCalibration> {
  const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, HudCalibration>);
}

function savedForCurrentVideo(): HudCalibration | undefined {
  return storedCalibrations()[VIDEO_KEY.fileName];
}

beforeEach(() => {
  window.localStorage.clear();
  mockStageBounds();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('校正の保存', () => {
  it('解析を開始した時点でファイル名をキーに保存する', async () => {
    renderApp();
    await loadVideo();
    drawCalibration();

    expect(savedForCurrentVideo()).toBeUndefined();

    await startAnalysis();

    expect(savedForCurrentVideo()).toBeDefined();
  });

  it('保存した校正に描いた矩形が入っている', async () => {
    renderApp();
    await loadVideo();
    drawCalibration();
    await startAnalysis();

    const saved = savedForCurrentVideo();
    expect(saved?.slots).toHaveLength(1);
    expect(saved?.slots[0].ammoRect.width).toBeGreaterThan(0);
    expect(saved?.boostRect.width).toBeGreaterThan(0);
  });

  it('保存した校正はどの動画のものかを持っている', async () => {
    renderApp();
    await loadVideo();
    drawCalibration();
    await startAnalysis();

    expect(savedForCurrentVideo()?.videoKey).toEqual(VIDEO_KEY);
  });

  it('校正が揃わないうちは保存しない', async () => {
    renderApp();
    await loadVideo();

    expect((screen.getByTestId('calibration-start') as HTMLButtonElement).disabled).toBe(true);
    expect(storedCalibrations()).toEqual({});
  });
});

describe('校正の再利用', () => {
  it('同じ動画を読み直すと再利用を提案する', async () => {
    const first = renderApp();
    await loadVideo();
    drawCalibration();
    await startAnalysis();
    first.unmount();

    renderApp();
    await loadVideo();

    expect(screen.getByRole('button', { name: '保存済みの校正を使う' })).toBeTruthy();
  });

  it('提案を受け入れれば描き直さずに解析を開始できる', async () => {
    const first = renderApp();
    await loadVideo();
    drawCalibration();
    await startAnalysis();
    first.unmount();

    renderApp();
    await loadVideo();
    fireEvent.click(screen.getByRole('button', { name: '保存済みの校正を使う' }));

    expect((screen.getByTestId('calibration-start') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('数字ラベルの引き継ぎ', () => {
  it('解決した数字は校正へ焼き込まれて保存される', async () => {
    renderApp(ammoChangeLook());
    await loadVideo();
    drawCalibration();
    await startAnalysis();
    await deliverScanFrames(6);

    // 保存直後の校正には、まだラベルの付いていないクラスタしか無い
    expect(savedForCurrentVideo()?.glyphBank.templates).toHaveLength(0);

    labelGlyphs([2, 1]);

    const templates = savedForCurrentVideo()?.glyphBank.templates ?? [];
    expect(templates).toHaveLength(2);
    expect(templates.map((template) => template.digit)).toEqual([2, 1]);
  });

  it('引き継いだラベルは次に同じ動画を読んだときの出発点になる', async () => {
    const first = renderApp(ammoChangeLook());
    await loadVideo();
    drawCalibration();
    await startAnalysis();
    await deliverScanFrames(6);
    labelGlyphs([2, 1]);
    first.unmount();

    renderApp(ammoChangeLook());
    await loadVideo();
    fireEvent.click(screen.getByRole('button', { name: '保存済みの校正を使う' }));
    await startAnalysis();
    await deliverScanFrames(6);

    // 前回のラベルが効くので、もう数字を尋ねられない
    expect(screen.queryByTestId('glyph-tutor')).toBeNull();
  });
});

describe('校正の保存に失敗したとき', () => {
  it('その旨を示しつつ解析は進む', async () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === CALIBRATION_STORAGE_KEY) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      original.call(this, key, value);
    });

    renderApp();
    await loadVideo();
    drawCalibration();
    await startAnalysis();

    expect(screen.getByTestId('calibration-save-error')).toBeTruthy();
    expect(screen.getByTestId('chart-author-app').dataset.phase).toBe('scanning');
  });
});
