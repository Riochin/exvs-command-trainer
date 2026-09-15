import { describe, it, expect } from 'vitest';
import type { Chart, ChartParseError } from '@/types/chart';
import { CHART_FORMAT_VERSION, parseChart } from '@/types/chart';

/** 妥当な譜面を組み立てる。個別テストで一部を壊して使う */
function validChartJson(): Record<string, unknown> {
  return {
    version: CHART_FORMAT_VERSION,
    source: { type: 'file', fileName: 'clip.mp4', offsetMs: 0 },
    steps: [
      { tMs: 1234, input: 'shot', confidence: 0.95, origin: 'auto' },
      { tMs: 1567, input: 'bd', confidence: 1, origin: 'manual' },
    ],
  };
}

/** 指定キーを落とした譜面 JSON を返す（欠落フィールドの検証用） */
function withoutKey(key: string): Record<string, unknown> {
  const json = validChartJson();
  delete json[key];
  return json;
}

function kinds(errors: readonly ChartParseError[]): string[] {
  return errors.map((e) => e.kind);
}

function pathsOf(errors: readonly ChartParseError[]): string[] {
  return errors.map((e) => ('path' in e ? e.path : ''));
}

describe('CHART_FORMAT_VERSION', () => {
  it('現行バージョンは 1', () => {
    expect(CHART_FORMAT_VERSION).toBe(1);
  });
});

describe('parseChart - 妥当な譜面', () => {
  it('妥当な譜面を受け入れ、値をそのまま保持する', () => {
    const result = parseChart(validChartJson());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chart: Chart = result.chart;
    expect(chart.version).toBe(CHART_FORMAT_VERSION);
    expect(chart.source).toEqual({ type: 'file', fileName: 'clip.mp4', offsetMs: 0 });
    expect(chart.steps).toHaveLength(2);
    expect(chart.steps[0]).toEqual({
      tMs: 1234,
      input: 'shot',
      confidence: 0.95,
      origin: 'auto',
    });
  });

  it('youtube 出典に videoId が付いていれば受け入れる', () => {
    const json = { ...validChartJson(), source: { type: 'youtube', videoId: 'abc123', offsetMs: -250 } };

    const result = parseChart(json);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chart.source.videoId).toBe('abc123');
    expect(result.chart.source.offsetMs).toBe(-250);
  });

  it('ステップが空でも受け入れる', () => {
    const result = parseChart({ ...validChartJson(), steps: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chart.steps).toEqual([]);
  });

  it('信頼度の境界値 0 と 1 を受け入れる', () => {
    const json = {
      ...validChartJson(),
      steps: [
        { tMs: 0, input: 'shot', confidence: 0, origin: 'auto' },
        { tMs: 1, input: 'shot', confidence: 1, origin: 'auto' },
      ],
    };

    expect(parseChart(json).ok).toBe(true);
  });
});

describe('parseChart - バージョン', () => {
  it('未知のバージョンを unsupported_version として拒否する', () => {
    const result = parseChart({ ...validChartJson(), version: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(kinds(result.errors)).toContain('unsupported_version');
    const error = result.errors.find((e) => e.kind === 'unsupported_version');
    expect(error).toEqual({ kind: 'unsupported_version', found: 2 });
  });

  it('version が欠落していても unsupported_version として拒否する', () => {
    const result = parseChart(withoutKey('version'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(kinds(result.errors)).toContain('unsupported_version');
  });

  it('バージョン不正のときステップの検証を試みない', () => {
    const result = parseChart({ ...validChartJson(), version: 99, steps: 'not-an-array' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(kinds(result.errors)).toEqual(['unsupported_version']);
  });
});

describe('parseChart - 入力種別', () => {
  it('ButtonType でない input を invalid_button_type として場所付きで拒否する', () => {
    const json = validChartJson();
    const result = parseChart({
      ...json,
      steps: [{ tMs: 100, input: 'dash', confidence: 1, origin: 'manual' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      kind: 'invalid_button_type',
      path: 'steps[0].input',
      value: 'dash',
    });
  });

  it('既存 ButtonType の全値を受け入れる', () => {
    const inputs = [
      'shot', 'melee', 'jump', 'bd', 'awaken',
      'shot-charge-start', 'shot-charge-end',
      'melee-charge-start', 'melee-charge-end',
      'sub', 'special-shot', 'special-melee',
    ];
    const json = {
      ...validChartJson(),
      steps: inputs.map((input, i) => ({ tMs: i * 100, input, confidence: 1, origin: 'auto' })),
    };

    const result = parseChart(json);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chart.steps).toHaveLength(inputs.length);
  });
});

describe('parseChart - 数値の範囲', () => {
  it('信頼度が 1 を超える場合を out_of_range として拒否する', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [{ tMs: 100, input: 'shot', confidence: 1.2, origin: 'auto' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      kind: 'out_of_range',
      path: 'steps[0].confidence',
      value: 1.2,
    });
  });

  it('信頼度が負の場合を out_of_range として拒否する', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [{ tMs: 100, input: 'shot', confidence: -0.1, origin: 'auto' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('steps[0].confidence');
  });

  it('負の tMs を out_of_range として拒否する', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [{ tMs: -1, input: 'shot', confidence: 1, origin: 'auto' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      kind: 'out_of_range',
      path: 'steps[0].tMs',
      value: -1,
    });
  });

  it('有限でない tMs を out_of_range として拒否する', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [{ tMs: Number.POSITIVE_INFINITY, input: 'shot', confidence: 1, origin: 'auto' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('steps[0].tMs');
  });
});

describe('parseChart - 形の不一致', () => {
  it('オブジェクトでない入力を invalid_shape として拒否する', () => {
    for (const value of [null, undefined, 42, 'chart', []]) {
      const result = parseChart(value);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(kinds(result.errors)).toContain('invalid_shape');
    }
  });

  it('source が欠落している場合を invalid_shape として拒否する', () => {
    const result = parseChart(withoutKey('source'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('source');
  });

  it('未知の source.type を invalid_shape として拒否する', () => {
    const result = parseChart({ ...validChartJson(), source: { type: 'twitch', offsetMs: 0 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('source.type');
  });

  it('youtube 出典で videoId が無い場合を invalid_shape として拒否する', () => {
    const result = parseChart({ ...validChartJson(), source: { type: 'youtube', offsetMs: 0 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('source.videoId');
  });

  it('offsetMs が数値でない場合を invalid_shape として拒否する', () => {
    const result = parseChart({ ...validChartJson(), source: { type: 'file', offsetMs: '0' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('source.offsetMs');
  });

  it('steps が配列でない場合を invalid_shape として拒否する', () => {
    const result = parseChart({ ...validChartJson(), steps: { '0': {} } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('steps');
  });

  it('未知の origin を invalid_shape として拒否する', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [{ tMs: 100, input: 'shot', confidence: 1, origin: 'imported' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('steps[0].origin');
  });

  it('tMs 昇順でないステップ列を invalid_shape として拒否する', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [
        { tMs: 500, input: 'shot', confidence: 1, origin: 'auto' },
        { tMs: 100, input: 'shot', confidence: 1, origin: 'auto' },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain('steps[1].tMs');
  });

  it('同一時刻のステップは昇順違反としない', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [
        { tMs: 100, input: 'shot', confidence: 1, origin: 'auto' },
        { tMs: 100, input: 'jump', confidence: 1, origin: 'auto' },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

describe('parseChart - エラーの列挙', () => {
  it('最初の 1 件で打ち切らず、複数ステップの不正をすべて列挙する', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [
        { tMs: 100, input: 'dash', confidence: 1, origin: 'auto' },
        { tMs: 200, input: 'shot', confidence: 5, origin: 'auto' },
        { tMs: 300, input: 'shot', confidence: 1, origin: 'guess' },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toEqual([
      'steps[0].input',
      'steps[1].confidence',
      'steps[2].origin',
    ]);
  });

  it('1 つのステップに複数の不正があればそのすべてを列挙する', () => {
    const result = parseChart({
      ...validChartJson(),
      steps: [{ tMs: -5, input: 'dash', confidence: 9, origin: 'auto' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toEqual([
      'steps[0].tMs',
      'steps[0].input',
      'steps[0].confidence',
    ]);
  });

  it('source とステップの不正を同時に列挙する', () => {
    const result = parseChart({
      version: CHART_FORMAT_VERSION,
      source: { type: 'youtube', offsetMs: 0 },
      steps: [{ tMs: 100, input: 'dash', confidence: 1, origin: 'auto' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toEqual(['source.videoId', 'steps[0].input']);
  });
});

describe('共有型モジュールからの再エクスポート', () => {
  it('@/types から parseChart と CHART_FORMAT_VERSION を参照できる', async () => {
    const shared = await import('@/types');

    expect(shared.CHART_FORMAT_VERSION).toBe(CHART_FORMAT_VERSION);
    expect(shared.parseChart(validChartJson()).ok).toBe(true);
  });
});
