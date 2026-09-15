/**
 * 再解析と校正やり直しで、手を入れたステップが失われないことの検証。
 *
 * 自動検出はやり直せば作り直せるが、人が入れたステップは作り直せない。
 * 「黙って消える経路がない」ことをここで固定する（Req 2.7, 5.4）。
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  adoptSavedCalibration,
  currentHarness,
  loadVideo,
  phaseOf,
  renderApp,
  runAnalysis,
  seedReusableCalibration,
  stepRows,
} from '../features/chart-author/appHarness';

function controllerButton(label: '射撃' | '格闘' | 'ジャンプ'): HTMLElement {
  const controller = within(screen.getByTestId('chart-author-controller'));
  const button = controller.getByText(label).closest('button');
  if (button === null) throw new Error(`${label} ボタンが見つかりません`);
  return button;
}

/** 一時停止中に射撃を 1 回。手動・信頼度 1 のステップが 1 件増える */
async function addManualStep(): Promise<void> {
  const shot = controllerButton('射撃');
  fireEvent.pointerDown(shot, { pointerId: 1 });
  fireEvent.pointerUp(shot, { pointerId: 1 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

function originsOf(): string[] {
  return stepRows().map((row) => (row.textContent?.includes('手動') === true ? '手動' : '自動'));
}

/** 自動検出 1 件と手動 1 件がある状態まで進める */
async function withAutoAndManualSteps(): Promise<void> {
  seedReusableCalibration();
  renderApp();
  await loadVideo();
  adoptSavedCalibration();
  await runAnalysis();
  await addManualStep();

  expect(originsOf()).toContain('自動');
  expect(originsOf()).toContain('手動');
}

/** 再解析を要求し、方針を選んでから走査を流し切る */
async function rerunWith(choice: '自動検出のみ差し替え' | '全ステップ破棄'): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '再解析する' }));
  expect(screen.getByRole('dialog', { name: '再解析の方針' })).toBeTruthy();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: choice }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    const source = currentHarness().frameSource;
    await source.deliverMany(6, 100);
    await source.finish();
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('再解析の方針', () => {
  it('自動検出のみ差し替えなら手動のステップは残る', async () => {
    await withAutoAndManualSteps();

    await rerunWith('自動検出のみ差し替え');

    expect(originsOf()).toContain('手動');
    expect(originsOf().filter((origin) => origin === '手動')).toHaveLength(1);
  });

  it('自動検出のみ差し替えでも自動のステップは作り直される', async () => {
    await withAutoAndManualSteps();

    await rerunWith('自動検出のみ差し替え');

    expect(originsOf().filter((origin) => origin === '自動')).toHaveLength(1);
  });

  it('全ステップ破棄を選んだときだけ手動のステップも消える', async () => {
    await withAutoAndManualSteps();

    await rerunWith('全ステップ破棄');

    expect(originsOf()).not.toContain('手動');
  });

  it('方針を選ぶまで走査は始まらない', async () => {
    await withAutoAndManualSteps();
    const before = stepRows().length;

    fireEvent.click(screen.getByRole('button', { name: '再解析する' }));

    expect(phaseOf()).not.toBe('scanning');
    expect(stepRows()).toHaveLength(before);
  });

  it('取りやめればステップは 1 件も動かない', async () => {
    await withAutoAndManualSteps();
    const before = stepRows().map((row) => row.textContent ?? '');

    fireEvent.click(screen.getByRole('button', { name: '再解析する' }));
    fireEvent.click(screen.getByRole('button', { name: '取りやめ' }));

    expect(screen.queryByRole('dialog', { name: '再解析の方針' })).toBeNull();
    expect(stepRows().map((row) => row.textContent ?? '')).toEqual(before);
  });

  it('確認は校正画面の解析開始からも必ず経由する', async () => {
    await withAutoAndManualSteps();

    fireEvent.click(screen.getByRole('button', { name: '校正をやり直す' }));
    fireEvent.click(screen.getByTestId('calibration-start'));

    expect(screen.getByRole('dialog', { name: '再解析の方針' })).toBeTruthy();
    expect(phaseOf()).not.toBe('scanning');
  });
});

describe('校正のやり直し', () => {
  it('校正へ戻っても手動のステップは残る', async () => {
    await withAutoAndManualSteps();

    fireEvent.click(screen.getByRole('button', { name: '校正をやり直す' }));

    expect(phaseOf()).toBe('calibrating');
    expect(originsOf()).toEqual(['手動']);
  });

  it('やり直しで無効になるのは走査結果と自動検出のぶんに限る', async () => {
    await withAutoAndManualSteps();
    const manualRow = stepRows().find((row) => row.textContent?.includes('手動') === true);
    const manualText = manualRow?.textContent ?? '';

    fireEvent.click(screen.getByRole('button', { name: '校正をやり直す' }));

    expect(stepRows()).toHaveLength(1);
    expect(stepRows()[0].textContent).toBe(manualText);
  });

  it('やり直しを取り消せば自動検出のステップも戻る', async () => {
    await withAutoAndManualSteps();
    const before = stepRows().length;

    fireEvent.click(screen.getByRole('button', { name: '校正をやり直す' }));
    fireEvent.click(screen.getByRole('button', { name: '直前の操作を取り消す' }));

    expect(stepRows()).toHaveLength(before);
  });
});
