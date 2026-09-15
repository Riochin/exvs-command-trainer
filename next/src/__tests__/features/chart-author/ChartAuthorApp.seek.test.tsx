import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadVideo, renderApp, stepRows } from './appHarness';

function controllerButton(label: '射撃' | '格闘' | 'ジャンプ'): HTMLElement {
  const controller = within(screen.getByTestId('chart-author-controller'));
  const button = controller.getByText(label).closest('button');
  if (button === null) throw new Error(`${label} ボタンが見つかりません`);
  return button;
}

async function tapShot(): Promise<void> {
  const shot = controllerButton('射撃');
  fireEvent.pointerDown(shot, { pointerId: 1 });
  fireEvent.pointerUp(shot, { pointerId: 1 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

function seekTo(tMs: number): void {
  fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
    target: { value: String(tMs) },
  });
}

function timecode(): string {
  return screen.getByTestId('transport-timecode').textContent ?? '';
}

/** 0ms と 2000ms に手動ステップを 1 件ずつ置いた状態を作る */
async function withTwoSteps(): Promise<void> {
  renderApp();
  await loadVideo();
  await tapShot();
  seekTo(2000);
  await tapShot();
  seekTo(5000);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChartAuthorApp - 一覧からのシーク', () => {
  it('一覧のステップを選ぶと動画がその時刻へ移る', async () => {
    await withTwoSteps();
    expect(timecode()).toBe('00:05.000');

    fireEvent.click(stepRows()[1]);

    expect(timecode()).toBe('00:02.000');
  });

  it('別のステップを選び直せば移動先も変わる', async () => {
    await withTwoSteps();

    fireEvent.click(stepRows()[1]);
    fireEvent.click(stepRows()[0]);

    expect(timecode()).toBe('00:00.000');
  });

  it('選んだステップが選択中かつ強調表示になる', async () => {
    await withTwoSteps();

    fireEvent.click(stepRows()[1]);

    const rows = stepRows();
    expect(rows[1].dataset.selected).toBe('true');
    expect(rows[1].dataset.nearest).toBe('true');
    expect(rows[0].dataset.nearest).toBe('false');
  });

  it('動画の再生位置表示と一覧の強調が食い違わない', async () => {
    await withTwoSteps();

    fireEvent.click(stepRows()[0]);

    expect(timecode()).toBe('00:00.000');
    expect(stepRows()[0].dataset.nearest).toBe('true');
  });
});

describe('ChartAuthorApp - タイムラインからのシーク', () => {
  it('マーカーを押すとその時刻へ移る', async () => {
    await withTwoSteps();

    fireEvent.click(screen.getAllByTestId('timeline-marker')[1]);

    expect(timecode()).toBe('00:02.000');
  });

  it('マーカーから選んでも一覧の強調が追随する', async () => {
    await withTwoSteps();

    fireEvent.click(screen.getAllByTestId('timeline-marker')[1]);

    const rows = stepRows();
    expect(rows[1].dataset.selected).toBe('true');
    expect(rows[1].dataset.nearest).toBe('true');
  });

  it('一覧とタイムラインのどちらから選んでも同じ結果になる', async () => {
    await withTwoSteps();

    fireEvent.click(screen.getAllByTestId('timeline-marker')[0]);
    const fromTimeline = timecode();
    fireEvent.click(stepRows()[1]);
    fireEvent.click(stepRows()[0]);

    expect(timecode()).toBe(fromTimeline);
  });
});
