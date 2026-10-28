import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CHART_FORMAT_VERSION } from '@/types/chart';
import {
  lastDownloadText,
  lastDownloadType,
  loadVideo,
  renderApp,
  stepRows,
} from './appHarness';

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

/** 0ms と 2000ms に手動ステップを 1 件ずつ置く */
async function withTwoSteps(): Promise<void> {
  renderApp();
  await loadVideo();
  await tapShot();
  seekTo(2000);
  await tapShot();
}

function rowTexts(): string[] {
  return stepRows().map((row) => row.textContent ?? '');
}

function removeAllSteps(): void {
  while (stepRows().length > 0) {
    fireEvent.click(stepRows()[0]);
    fireEvent.click(screen.getByRole('button', { name: '選択中のステップを削除' }));
  }
}

async function importJson(text: string, name = 'chart.json'): Promise<void> {
  const file = new File([text], name, { type: 'application/json' });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('譜面ファイル'), { target: { files: [file] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChartAuthorApp - エクスポート', () => {
  it('出力した譜面を読み込み直すと同じ一覧に戻る', async () => {
    await withTwoSteps();
    const before = rowTexts();

    fireEvent.click(screen.getByRole('button', { name: 'JSON をダウンロード' }));
    const exported = await lastDownloadText();

    removeAllSteps();
    expect(stepRows()).toHaveLength(0);

    await importJson(exported);

    expect(rowTexts()).toEqual(before);
  });

  it('CSV も選べる', async () => {
    await withTwoSteps();

    fireEvent.click(screen.getByRole('button', { name: 'CSV をダウンロード' }));

    expect(lastDownloadType()).toBe('text/csv');
    const csv = await lastDownloadText();
    expect(csv.trim().split('\n')).toHaveLength(3);
  });

  it('設定した出典と時刻補正が出力に反映される', async () => {
    await withTwoSteps();

    fireEvent.change(screen.getByRole('combobox', { name: '出典の種別' }), {
      target: { value: 'youtube' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '動画 ID' }), {
      target: { value: 'abc123' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: '出力オフセット（ミリ秒）' }), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'JSON をダウンロード' }));

    const chart = JSON.parse(await lastDownloadText());
    expect(chart.source).toMatchObject({ type: 'youtube', videoId: 'abc123', offsetMs: 100 });
    expect(chart.steps[0].tMs).toBe(100);
  });

  it('出力オフセットは編集中の時刻を動かさない', async () => {
    await withTwoSteps();

    fireEvent.change(screen.getByRole('spinbutton', { name: '出力オフセット（ミリ秒）' }), {
      target: { value: '100' },
    });

    expect(rowTexts()[0]).toContain('00:00.000');
  });
});

describe('ChartAuthorApp - インポート', () => {
  it('読み込んだ譜面が一覧とタイムラインの両方に載る', async () => {
    renderApp();
    await loadVideo();

    await importJson(
      JSON.stringify({
        version: CHART_FORMAT_VERSION,
        source: { type: 'file', fileName: 'clip.mp4', offsetMs: 0 },
        steps: [
          { tMs: 1000, input: 'shot', confidence: 1, origin: 'manual' },
          { tMs: 4000, input: 'bd', confidence: 0.4, origin: 'auto' },
        ],
      }),
    );

    expect(stepRows()).toHaveLength(2);
    expect(screen.getAllByTestId('timeline-marker')).toHaveLength(2);
    expect(rowTexts()[1]).toContain('00:04.000');
  });

  it('不正な譜面は取り込まず、理由を場所とともに示す', async () => {
    await withTwoSteps();
    const before = rowTexts();

    await importJson(
      JSON.stringify({
        version: CHART_FORMAT_VERSION,
        source: { type: 'file', offsetMs: 0 },
        steps: [{ tMs: 0, input: 'dash', confidence: 1, origin: 'manual' }],
      }),
    );

    const errors = screen.getByTestId('import-errors').textContent ?? '';
    expect(errors).toContain('dash');
    expect(rowTexts()).toEqual(before);
  });

  it('バージョンが違う譜面も取り込まない', async () => {
    await withTwoSteps();
    const before = rowTexts();

    await importJson(
      JSON.stringify({
        version: CHART_FORMAT_VERSION + 1,
        source: { type: 'file', offsetMs: 0 },
        steps: [],
      }),
    );

    expect(screen.getByTestId('import-errors').textContent).toContain(
      String(CHART_FORMAT_VERSION + 1),
    );
    expect(rowTexts()).toEqual(before);
  });

  it('JSON として読めないファイルも既存の編集内容を変えない', async () => {
    await withTwoSteps();
    const before = rowTexts();

    await importJson('これは JSON ではありません');

    expect(screen.getByTestId('import-errors')).toBeTruthy();
    expect(rowTexts()).toEqual(before);
  });

  it('取り込みに成功すれば直前の拒否理由は消える', async () => {
    await withTwoSteps();

    await importJson('壊れたファイル');
    expect(screen.getByTestId('import-errors')).toBeTruthy();

    await importJson(
      JSON.stringify({
        version: CHART_FORMAT_VERSION,
        source: { type: 'file', offsetMs: 0 },
        steps: [{ tMs: 0, input: 'shot', confidence: 1, origin: 'manual' }],
      }),
    );

    expect(screen.queryByTestId('import-errors')).toBeNull();
    expect(stepRows()).toHaveLength(1);
  });
});
