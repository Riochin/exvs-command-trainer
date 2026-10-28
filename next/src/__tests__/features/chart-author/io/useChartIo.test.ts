import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChartIo } from '@/features/chart-author/io/useChartIo';
import { serializeChart, toChart } from '@/features/chart-author/io/chartCodec';
import { CHART_FORMAT_VERSION } from '@/types/chart';
import type { ChartSource } from '@/types/chart';
import type { EditorStep } from '@/features/chart-author/types';

function editorStep(patch: Partial<EditorStep> = {}): EditorStep {
  return {
    id: 'id-1',
    tMs: 1000,
    input: 'shot',
    confidence: 0.95,
    origin: 'auto',
    detector: 'ammo',
    caveat: 'none',
    ...patch,
  };
}

const STEPS: readonly EditorStep[] = [
  editorStep({ id: 'a', tMs: 1000, input: 'shot' }),
  editorStep({ id: 'b', tMs: 2000, input: 'bd', origin: 'manual', detector: null }),
];

/** ダウンロードのために作られた Blob と、指定されたファイル名 */
type Captured = { blobs: Blob[]; names: string[] };

const captured: Captured = { blobs: [], names: [] };

beforeEach(() => {
  captured.blobs = [];
  captured.names = [];
  vi.restoreAllMocks();

  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn((blob: Blob) => {
      captured.blobs.push(blob);
      return `blob:mock-${captured.blobs.length}`;
    }),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    captured.names.push(this.download);
  });
});

/** 直近にダウンロードされた内容 */
async function lastContent(): Promise<string> {
  const blob = captured.blobs[captured.blobs.length - 1];
  return await blob.text();
}

describe('useChartIo の出典設定', () => {
  it('初期の出典はファイル種別・補正なしで始まる', () => {
    const { result } = renderHook(() => useChartIo());
    expect(result.current.source).toEqual({ type: 'file', offsetMs: 0 });
  });

  it('初期の出典を与えられる', () => {
    const initial: ChartSource = { type: 'file', fileName: 'clip.mp4', offsetMs: 0 };
    const { result } = renderHook(() => useChartIo(initial));
    expect(result.current.source).toEqual(initial);
  });

  it('出典の種別・動画 ID・時刻補正を設定できる', () => {
    const { result } = renderHook(() => useChartIo());
    const next: ChartSource = { type: 'youtube', videoId: 'abc123', offsetMs: -250 };
    act(() => result.current.setSource(next));
    expect(result.current.source).toEqual(next);
  });
});

describe('useChartIo のダウンロード', () => {
  it('JSON をファイルとしてダウンロードする', async () => {
    const { result } = renderHook(() =>
      useChartIo({ type: 'file', fileName: 'clip.mp4', offsetMs: 0 }),
    );
    act(() => result.current.downloadJson(STEPS));

    expect(captured.names).toHaveLength(1);
    expect(captured.names[0]).toMatch(/\.json$/);
    expect(captured.blobs[0].type).toContain('json');
    expect(JSON.parse(await lastContent())).toEqual(
      JSON.parse(
        serializeChart(toChart(STEPS, { type: 'file', fileName: 'clip.mp4', offsetMs: 0 })),
      ),
    );
  });

  it('CSV をファイルとしてダウンロードする', async () => {
    const { result } = renderHook(() => useChartIo());
    act(() => result.current.downloadCsv(STEPS));

    expect(captured.names[0]).toMatch(/\.csv$/);
    expect(captured.blobs[0].type).toContain('csv');
    const lines = (await lastContent()).replace(/\n$/, '').split('\n');
    expect(lines[0]).toBe('tMs,input,confidence,origin');
    expect(lines).toHaveLength(STEPS.length + 1);
  });

  it('設定した出典が出力ファイルに反映される', async () => {
    const { result } = renderHook(() => useChartIo());
    const source: ChartSource = { type: 'youtube', videoId: 'abc123', offsetMs: 0 };
    act(() => result.current.setSource(source));
    act(() => result.current.downloadJson(STEPS));

    const chart = JSON.parse(await lastContent());
    expect(chart.source).toEqual(source);
    expect(chart.version).toBe(CHART_FORMAT_VERSION);
  });

  it('時刻補正を出力時に適用する', async () => {
    const { result } = renderHook(() => useChartIo());
    act(() => result.current.setSource({ type: 'file', offsetMs: 500 }));
    act(() => result.current.downloadJson(STEPS));

    const chart = JSON.parse(await lastContent());
    expect(chart.steps.map((s: { tMs: number }) => s.tMs)).toEqual([1500, 2500]);
  });

  it('負の時刻補正も出力時に適用する', async () => {
    const { result } = renderHook(() => useChartIo());
    act(() => result.current.setSource({ type: 'file', offsetMs: -400 }));
    act(() => result.current.downloadJson(STEPS));

    const chart = JSON.parse(await lastContent());
    expect(chart.steps.map((s: { tMs: number }) => s.tMs)).toEqual([600, 1600]);
  });

  it('時刻補正は CSV の出力にも同じく適用される', async () => {
    const { result } = renderHook(() => useChartIo());
    act(() => result.current.setSource({ type: 'file', offsetMs: 500 }));
    act(() => result.current.downloadCsv(STEPS));

    const rows = (await lastContent()).replace(/\n$/, '').split('\n').slice(1);
    expect(rows.map((r) => Number(r.split(',')[0]))).toEqual([1500, 2500]);
  });

  it('時刻補正は編集中のステップ列に反映しない', async () => {
    const { result } = renderHook(() => useChartIo());
    act(() => result.current.setSource({ type: 'file', offsetMs: 500 }));
    act(() => result.current.downloadJson(STEPS));
    expect(STEPS.map((s) => s.tMs)).toEqual([1000, 2000]);
  });

  it('続けて出力しても補正が二重に適用されない', async () => {
    const { result } = renderHook(() => useChartIo());
    act(() => result.current.setSource({ type: 'file', offsetMs: 500 }));
    act(() => result.current.downloadJson(STEPS));
    const first = await lastContent();
    act(() => result.current.downloadJson(STEPS));
    expect(await lastContent()).toBe(first);
  });

  it('出典のファイル名を出力ファイル名に使う', () => {
    const { result } = renderHook(() =>
      useChartIo({ type: 'file', fileName: 'battle-01.mp4', offsetMs: 0 }),
    );
    act(() => result.current.downloadJson(STEPS));
    expect(captured.names[0]).toContain('battle-01');
    expect(captured.names[0]).not.toContain('.mp4');
  });

  it('YouTube 出典では動画 ID を出力ファイル名に使う', () => {
    const { result } = renderHook(() =>
      useChartIo({ type: 'youtube', videoId: 'abc123', offsetMs: 0 }),
    );
    act(() => result.current.downloadCsv(STEPS));
    expect(captured.names[0]).toContain('abc123');
  });

  it('生成した URL を解放する', () => {
    const { result } = renderHook(() => useChartIo());
    act(() => result.current.downloadJson(STEPS));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('ダウンロード後に一時要素を残さない', () => {
    const { result } = renderHook(() => useChartIo());
    act(() => result.current.downloadJson(STEPS));
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
});

describe('useChartIo の読み込み', () => {
  /** 与えた内容を持つローカルファイルを模す */
  function fileOf(content: string, name = 'chart.json'): File {
    return new File([content], name, { type: 'application/json' });
  }

  it('妥当な譜面ファイルを読み込んで譜面を返す', async () => {
    const { result } = renderHook(() => useChartIo());
    const chart = toChart(STEPS, { type: 'file', fileName: 'clip.mp4', offsetMs: 0 });

    const imported = await result.current.importFromFile(fileOf(serializeChart(chart)));
    expect(imported.ok).toBe(true);
    expect(imported.ok && imported.chart).toEqual(chart);
  });

  it('検証に失敗した譜面は理由をそのまま返す', async () => {
    const { result } = renderHook(() => useChartIo());
    const chart = toChart(STEPS, { type: 'file', offsetMs: 0 });

    const imported = await result.current.importFromFile(
      fileOf(JSON.stringify({ ...chart, version: 99 })),
    );
    expect(imported.ok).toBe(false);
    expect(imported.ok === false && imported.errors[0]).toEqual({
      kind: 'unsupported_version',
      found: 99,
    });
  });

  it('妥当でない入力種別は場所付きで返る', async () => {
    const { result } = renderHook(() => useChartIo());
    const chart = toChart(STEPS, { type: 'file', offsetMs: 0 });
    const broken = { ...chart, steps: [{ ...chart.steps[0], input: 'teleport' }] };

    const imported = await result.current.importFromFile(fileOf(JSON.stringify(broken)));
    expect(imported.ok === false && imported.errors).toContainEqual({
      kind: 'invalid_button_type',
      path: 'steps[0].input',
      value: 'teleport',
    });
  });

  it('JSON として読めないファイルは読み込み失敗として返す', async () => {
    const { result } = renderHook(() => useChartIo());
    const imported = await result.current.importFromFile(fileOf('{ not json'));
    expect(imported.ok).toBe(false);
    expect(imported.ok === false && imported.errors[0].kind).toBe('invalid_shape');
    expect(imported.ok === false && imported.errors[0]).toHaveProperty('path', '$');
  });

  it('読み込みは出典の設定を書き換えない', async () => {
    const { result } = renderHook(() => useChartIo());
    const source: ChartSource = { type: 'youtube', videoId: 'abc123', offsetMs: 100 };
    act(() => result.current.setSource(source));

    const chart = toChart(STEPS, { type: 'file', fileName: 'other.mp4', offsetMs: 900 });
    await result.current.importFromFile(fileOf(serializeChart(chart)));
    expect(result.current.source).toEqual(source);
  });
});
