import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadVideo, renderApp, stepRows } from './appHarness';

/** アーケードコントローラの物理ボタン。一覧にも同じ語が並ぶので範囲を絞る */
function controllerButton(label: '射撃' | '格闘' | 'ジャンプ'): HTMLElement {
  const controller = within(screen.getByTestId('chart-author-controller'));
  const button = controller.getByText(label).closest('button');
  if (button === null) throw new Error(`${label} ボタンが見つかりません`);
  return button;
}

/** 同時押し判定の遅延（50ms）を実時間で越えさせる */
async function settleInput(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

async function tapShot(): Promise<void> {
  const shot = controllerButton('射撃');
  fireEvent.pointerDown(shot, { pointerId: 1 });
  fireEvent.pointerUp(shot, { pointerId: 1 });
  await settleInput();
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChartAuthorApp - アーケードコントローラの配置', () => {
  it('動画を読み込むとコントローラが画面に並ぶ', async () => {
    renderApp();
    await loadVideo();

    expect(controllerButton('射撃')).toBeTruthy();
    expect(controllerButton('格闘')).toBeTruthy();
    expect(controllerButton('ジャンプ')).toBeTruthy();
  });

  it('動画を読み込むまではコントローラを出さない', () => {
    renderApp();

    expect(screen.queryByTestId('chart-author-controller')).toBeNull();
  });
});

describe('ChartAuthorApp - 一時停止中の手動ラベル付け', () => {
  it('ボタンを押すと手動・信頼度 1 のステップが増える', async () => {
    renderApp();
    await loadVideo();

    await tapShot();

    const rows = stepRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('射撃');
    expect(rows[0].textContent).toContain('手動');
    expect(rows[0].textContent).toContain('1.00');
  });

  it('現在の再生位置にステップを置く', async () => {
    renderApp();
    await loadVideo();

    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '2000' },
    });
    await tapShot();

    expect(stepRows()[0].textContent).toContain('00:02.000');
  });

  it('続けて押せばその数だけ増える', async () => {
    renderApp();
    await loadVideo();

    await tapShot();
    fireEvent.change(screen.getByRole('slider', { name: '再生位置' }), {
      target: { value: '1000' },
    });
    await tapShot();

    expect(stepRows()).toHaveLength(2);
  });

  it('キーボードのデバッグキーも従来どおり入力として届く', async () => {
    renderApp();
    await loadVideo();

    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyUp(window, { key: 'f' });
    await settleInput();

    expect(stepRows()[0].textContent).toContain('射撃');
  });
});

describe('ChartAuthorApp - 再生中の入力', () => {
  it('再生中のボタンはステップにしない', async () => {
    renderApp();
    await loadVideo();

    fireEvent.click(screen.getByRole('button', { name: '再生' }));
    await tapShot();

    expect(stepRows()).toHaveLength(0);
  });

  it('一時停止に戻せばまた受け付ける', async () => {
    renderApp();
    await loadVideo();

    fireEvent.click(screen.getByRole('button', { name: '再生' }));
    await tapShot();
    fireEvent.click(screen.getByRole('button', { name: '一時停止' }));
    await tapShot();

    expect(stepRows()).toHaveLength(1);
  });
});

describe('ChartAuthorApp - 合成入力', () => {
  it('同時押しの合成結果をそのまま入力種別として受け取る', async () => {
    renderApp();
    await loadVideo();

    fireEvent.pointerDown(controllerButton('射撃'), { pointerId: 1 });
    fireEvent.pointerDown(controllerButton('格闘'), { pointerId: 2 });
    await settleInput();

    expect(stepRows()[0].textContent).toContain('サブ');
  });

  it('射撃とジャンプの同時押しは特射として受け取る', async () => {
    renderApp();
    await loadVideo();

    fireEvent.pointerDown(controllerButton('射撃'), { pointerId: 1 });
    fireEvent.pointerDown(controllerButton('ジャンプ'), { pointerId: 2 });
    await settleInput();

    expect(stepRows()[0].textContent).toContain('特射');
  });
});
