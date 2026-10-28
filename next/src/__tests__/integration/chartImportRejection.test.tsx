/**
 * 譜面の読み込みが拒否される筋道の検証。
 *
 * 取り込みは「全部通るか、1 件も入らないか」のどちらかでなければならない。
 * 部分的に入ると、画面上は正しく見える壊れた譜面ができてしまう（Req 8.6, 8.7）。
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CHART_FORMAT_VERSION } from '@/types/chart';
import { loadVideo, renderApp, stepRows } from '../features/chart-author/appHarness';

function controllerButton(label: '射撃' | '格闘' | 'ジャンプ'): HTMLElement {
  const controller = within(screen.getByTestId('chart-author-controller'));
  const button = controller.getByText(label).closest('button');
  if (button === null) throw new Error(`${label} ボタンが見つかりません`);
  return button;
}

async function addManualStep(): Promise<void> {
  const shot = controllerButton('射撃');
  fireEvent.pointerDown(shot, { pointerId: 1 });
  fireEvent.pointerUp(shot, { pointerId: 1 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

async function importJson(payload: unknown): Promise<void> {
  const file = new File([JSON.stringify(payload)], 'chart.json', {
    type: 'application/json',
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('譜面ファイル'), { target: { files: [file] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function validStep(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { tMs: 1_000, input: 'shot', confidence: 0.9, origin: 'auto', ...patch };
}

function chartWith(steps: readonly unknown[], version = CHART_FORMAT_VERSION) {
  return { version, source: { type: 'file', fileName: 'clip.mp4', offsetMs: 0 }, steps };
}

function rowTexts(): string[] {
  return stepRows().map((row) => row.textContent ?? '');
}

function errorText(): string {
  return screen.getByTestId('import-errors').textContent ?? '';
}

/** 編集中の譜面が 1 件ある状態。拒否で失われないことの比較対象にする */
async function withExistingWork(): Promise<string[]> {
  renderApp();
  await loadVideo();
  await addManualStep();
  return rowTexts();
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('譜面インポートの拒否 - 未知のバージョン', () => {
  it('対応していないバージョンは取り込まず、その値を示す', async () => {
    const before = await withExistingWork();

    await importJson(chartWith([validStep()], CHART_FORMAT_VERSION + 1));

    expect(errorText()).toContain(String(CHART_FORMAT_VERSION + 1));
    expect(rowTexts()).toEqual(before);
  });
});

describe('譜面インポートの拒否 - 不正な入力種別', () => {
  it('既存の入力種別にない値は取り込まず、場所と値を示す', async () => {
    const before = await withExistingWork();

    await importJson(chartWith([validStep(), validStep({ input: 'dash' })]));

    expect(errorText()).toContain('steps[1].input');
    expect(errorText()).toContain('dash');
    expect(rowTexts()).toEqual(before);
  });

  it('妥当なステップが混ざっていても部分的には取り込まない', async () => {
    const before = await withExistingWork();

    await importJson(chartWith([validStep(), validStep({ input: 'dash' })]));

    expect(stepRows()).toHaveLength(before.length);
  });
});

describe('譜面インポートの拒否 - 範囲外の信頼度', () => {
  it('1 を超える信頼度は取り込まず、場所と値を示す', async () => {
    const before = await withExistingWork();

    await importJson(chartWith([validStep({ confidence: 1.5 })]));

    expect(errorText()).toContain('steps[0].confidence');
    expect(errorText()).toContain('1.5');
    expect(rowTexts()).toEqual(before);
  });

  it('負の信頼度も取り込まない', async () => {
    const before = await withExistingWork();

    await importJson(chartWith([validStep({ confidence: -0.2 })]));

    expect(errorText()).toContain('steps[0].confidence');
    expect(rowTexts()).toEqual(before);
  });
});

describe('譜面インポートの拒否 - まとめ', () => {
  it('不正が複数あれば最初の 1 件で打ち切らずすべて並べる', async () => {
    await withExistingWork();

    await importJson(
      chartWith([validStep({ input: 'dash' }), validStep({ confidence: 9 })]),
    );

    const items = within(screen.getByTestId('import-errors')).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(errorText()).toContain('steps[0].input');
    expect(errorText()).toContain('steps[1].confidence');
  });

  it('拒否のあともタイムラインの内容が変わらない', async () => {
    await withExistingWork();
    const before = screen.getAllByTestId('timeline-marker').length;

    await importJson(chartWith([validStep({ input: 'dash' })]));

    expect(screen.getAllByTestId('timeline-marker')).toHaveLength(before);
  });

  it('拒否のあとでも妥当な譜面なら取り込める', async () => {
    await withExistingWork();

    await importJson(chartWith([validStep({ input: 'dash' })]));
    await importJson(chartWith([validStep({ tMs: 2_000, input: 'melee' })]));

    expect(screen.queryByTestId('import-errors')).toBeNull();
    expect(stepRows()).toHaveLength(1);
    expect(rowTexts()[0]).toContain('格闘');
  });
});
