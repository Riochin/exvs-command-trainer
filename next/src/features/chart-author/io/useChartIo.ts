'use client';

/**
 * 譜面のファイル出力と読み込み。
 *
 * 純関数である codec 群に対して、Blob と `<a download>`、File の読み取りという
 * 副作用をここだけが引き受ける。
 *
 * 時刻補正（source.offsetMs）の適用位置もここ。編集中の tMs は常に動画の素の
 * 時刻であり、補正は出力の瞬間にだけ加算される。編集用の全体オフセット
 * （譜面そのものを動かす操作）と二重に適用されないための境界。
 */
import { useCallback, useState } from 'react';
import type { Chart, ChartParseError, ChartSource } from '@/types/chart';
import type { EditorStep } from '../types';
import { parseChart, serializeChart, toChart } from './chartCodec';
import { serializeChartCsv } from './csvCodec';

export type ChartImportResult =
  | { readonly ok: true; readonly chart: Chart }
  | { readonly ok: false; readonly errors: readonly ChartParseError[] };

export interface UseChartIoReturn {
  readonly source: ChartSource;
  setSource(next: ChartSource): void;
  downloadJson(steps: readonly EditorStep[]): void;
  downloadCsv(steps: readonly EditorStep[]): void;
  importFromFile(file: File): Promise<ChartImportResult>;
}

const DEFAULT_SOURCE: ChartSource = { type: 'file', offsetMs: 0 };

/** 出力ファイル名の元にする名前。拡張子は落とす */
function baseNameOf(source: ChartSource): string {
  const raw = source.type === 'youtube' ? source.videoId : source.fileName;
  if (raw === undefined || raw === '') return 'chart';
  return raw.replace(/\.[^./\\]+$/, '');
}

function triggerDownload(content: string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function useChartIo(initialSource: ChartSource = DEFAULT_SOURCE): UseChartIoReturn {
  const [source, setSource] = useState<ChartSource>(initialSource);

  /** 出力用の譜面を組み立てる。補正はここでのみ加算し、元のステップ列は変えない */
  const buildChart = useCallback(
    (steps: readonly EditorStep[]): Chart =>
      toChart(
        steps.map((step) => ({ ...step, tMs: step.tMs + source.offsetMs })),
        source,
      ),
    [source],
  );

  const downloadJson = useCallback(
    (steps: readonly EditorStep[]) => {
      triggerDownload(
        serializeChart(buildChart(steps)),
        `${baseNameOf(source)}-chart.json`,
        'application/json',
      );
    },
    [buildChart, source],
  );

  const downloadCsv = useCallback(
    (steps: readonly EditorStep[]) => {
      triggerDownload(
        serializeChartCsv(buildChart(steps)),
        `${baseNameOf(source)}-chart.csv`,
        'text/csv',
      );
    },
    [buildChart, source],
  );

  const importFromFile = useCallback(async (file: File): Promise<ChartImportResult> => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return {
        ok: false,
        errors: [
          {
            kind: 'invalid_shape',
            path: '$',
            message: 'ファイルを JSON として読み取れませんでした',
          },
        ],
      };
    }
    // 検証は共有型が所有する。結果はそのまま呼び出し側へ渡し、部分的に取り込まない
    return parseChart(raw);
  }, []);

  return { source, setSource, downloadJson, downloadCsv, importFromFile };
}
