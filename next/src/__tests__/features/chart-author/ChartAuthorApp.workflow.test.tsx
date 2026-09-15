import { act, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  adoptSavedCalibration,
  loadVideo,
  phaseOf,
  pressControllerShot,
  renderApp,
  runAnalysis,
  seedReusableCalibration,
  stepRows,
  videoFile,
} from './appHarness';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChartAuthorApp - 段階の遷移', () => {
  it('動画を選ぶ前は校正も一覧も出さない', () => {
    renderApp();

    expect(phaseOf()).toBe('idle');
    expect(screen.queryByTestId('calibration-panel')).toBeNull();
    expect(screen.queryByTestId('step-list')).toBeNull();
  });

  it('動画を読み込むと校正の段階に入る', async () => {
    renderApp();

    await loadVideo();

    expect(phaseOf()).toBe('calibrating');
    expect(screen.getByTestId('calibration-panel')).toBeTruthy();
  });

  it('読み込みに失敗したらファイル名を添えて伝え、段階を進めない', async () => {
    renderApp();

    await loadVideo('error', videoFile('broken.mp4'));

    expect(phaseOf()).toBe('idle');
    expect(screen.getByTestId('video-load-failure').textContent).toContain('broken.mp4');
  });
});

describe('ChartAuthorApp - 校正を通さない解析の禁止', () => {
  it('校正が揃うまで解析を開始できない', async () => {
    renderApp();

    await loadVideo();

    expect((screen.getByTestId('calibration-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('保存済みの校正を採用すれば解析を開始できる', async () => {
    seedReusableCalibration();
    renderApp();

    await loadVideo();
    adoptSavedCalibration();

    expect((screen.getByTestId('calibration-start') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('ChartAuthorApp - 解析の完了', () => {
  it('走査を終えると編集の段階へ進み、検出したステップが一覧に載る', async () => {
    seedReusableCalibration();
    renderApp();

    await loadVideo();
    adoptSavedCalibration();
    await runAnalysis();

    expect(phaseOf()).toBe('editing');
    expect(stepRows().length).toBeGreaterThan(0);
  });
});

describe('ChartAuthorApp - 校正のやり直し', () => {
  it('解析後でも校正へ戻れる', async () => {
    seedReusableCalibration();
    renderApp();

    await loadVideo();
    adoptSavedCalibration();
    await runAnalysis();

    fireEvent.click(screen.getByRole('button', { name: '校正をやり直す' }));

    expect(phaseOf()).toBe('calibrating');
  });

  it('校正へ戻っても手動で足したステップは消えず、自動検出のぶんだけが無効になる', async () => {
    seedReusableCalibration();
    renderApp();

    await loadVideo();
    adoptSavedCalibration();
    await runAnalysis();
    await pressControllerShot();

    const before = stepRows().map((row) => row.textContent ?? '');
    expect(before.filter((text) => text.includes('自動')).length).toBeGreaterThan(0);
    expect(before.filter((text) => text.includes('手動'))).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '校正をやり直す' }));

    const after = stepRows().map((row) => row.textContent ?? '');
    expect(after).toHaveLength(1);
    expect(after[0]).toContain('手動');
  });
});

describe('ChartAuthorApp - 再解析の確認', () => {
  it('ステップが残っているうちは確認なしに走査へ入らない', async () => {
    seedReusableCalibration();
    renderApp();

    await loadVideo();
    adoptSavedCalibration();
    await runAnalysis();
    await pressControllerShot();

    fireEvent.click(screen.getByRole('button', { name: '校正をやり直す' }));
    fireEvent.click(screen.getByTestId('calibration-start'));

    expect(screen.getByRole('dialog', { name: '再解析の方針' })).toBeTruthy();
    expect(phaseOf()).not.toBe('scanning');
  });

  it('確認を取りやめれば走査は始まらず、ステップもそのまま残る', async () => {
    seedReusableCalibration();
    renderApp();

    await loadVideo();
    adoptSavedCalibration();
    await runAnalysis();
    await pressControllerShot();

    fireEvent.click(screen.getByRole('button', { name: '校正をやり直す' }));
    fireEvent.click(screen.getByTestId('calibration-start'));
    fireEvent.click(screen.getByRole('button', { name: '取りやめ' }));

    expect(screen.queryByRole('dialog', { name: '再解析の方針' })).toBeNull();
    expect(phaseOf()).toBe('calibrating');
    expect(stepRows()).toHaveLength(1);
  });

  it('最初の解析では確認を挟まない', async () => {
    seedReusableCalibration();
    renderApp();

    await loadVideo();
    adoptSavedCalibration();
    await act(async () => {
      fireEvent.click(screen.getByTestId('calibration-start'));
    });

    expect(screen.queryByRole('dialog', { name: '再解析の方針' })).toBeNull();
  });
});
