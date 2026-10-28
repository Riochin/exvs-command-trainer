/**
 * 譜面（chart）フォーマットの共有定義。
 *
 * 譜面作成ツールと、後続の譜面練習モードが共有する唯一の契約。
 * 編集用 ID・HUD 校正データ・解析の中間表現といったツール内部の概念は
 * ここに含めない（それらは features/chart-author 側が所有する）。
 */
import type { ButtonType } from './index';
import { isButtonType } from './index';

/** 現行の譜面フォーマットバージョン。整数で単調増加する */
export const CHART_FORMAT_VERSION = 1;

export type ChartSourceType = 'file' | 'youtube';

export type ChartSource = {
  readonly type: ChartSourceType;
  /** type が 'youtube' のときに意味を持つ */
  readonly videoId?: string;
  /** type が 'file' のときに意味を持つ。参照情報であり再現性は保証しない */
  readonly fileName?: string;
  /** 譜面全体に適用する時刻補正。正なら譜面が後ろにずれる */
  readonly offsetMs: number;
};

export type ChartStepOrigin = 'auto' | 'manual';

export type ChartStep = {
  readonly tMs: number;
  readonly input: ButtonType;
  /** 0 以上 1 以下 */
  readonly confidence: number;
  readonly origin: ChartStepOrigin;
};

export type Chart = {
  readonly version: number;
  readonly source: ChartSource;
  /** tMs 昇順であることを不変条件とする */
  readonly steps: readonly ChartStep[];
};

export type ChartParseError =
  | { readonly kind: 'unsupported_version'; readonly found: unknown }
  | { readonly kind: 'invalid_shape'; readonly path: string; readonly message: string }
  | { readonly kind: 'invalid_button_type'; readonly path: string; readonly value: unknown }
  | { readonly kind: 'out_of_range'; readonly path: string; readonly value: unknown };

export type ChartParseResult =
  | { readonly ok: true; readonly chart: Chart }
  | { readonly ok: false; readonly errors: readonly ChartParseError[] };

const CHART_SOURCE_TYPES = new Set<string>(['file', 'youtube']);
const CHART_STEP_ORIGINS = new Set<string>(['auto', 'manual']);

export function isChartSourceType(value: unknown): value is ChartSourceType {
  return typeof value === 'string' && CHART_SOURCE_TYPES.has(value);
}

export function isChartStepOrigin(value: unknown): value is ChartStepOrigin {
  return typeof value === 'string' && CHART_STEP_ORIGINS.has(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shapeError(path: string, message: string): ChartParseError {
  return { kind: 'invalid_shape', path, message };
}

/**
 * 出典を検証し、不正箇所を errors へ追記する。
 * 形が壊れていても検証は打ち切らず、判定できる項目はすべて見る。
 */
function collectSourceErrors(raw: unknown, errors: ChartParseError[]): void {
  if (!isPlainObject(raw)) {
    errors.push(shapeError('source', 'source はオブジェクトである必要があります'));
    return;
  }

  if (!isChartSourceType(raw.type)) {
    errors.push(shapeError('source.type', "source.type は 'file' または 'youtube' である必要があります"));
  } else if (raw.type === 'youtube' && typeof raw.videoId !== 'string') {
    errors.push(shapeError('source.videoId', "source.type が 'youtube' のとき source.videoId は文字列である必要があります"));
  }

  if (raw.fileName !== undefined && typeof raw.fileName !== 'string') {
    errors.push(shapeError('source.fileName', 'source.fileName は文字列である必要があります'));
  }

  if (typeof raw.offsetMs !== 'number' || !Number.isFinite(raw.offsetMs)) {
    errors.push(shapeError('source.offsetMs', 'source.offsetMs は有限の数値である必要があります'));
  }
}

/**
 * ステップ 1 件を検証し、不正箇所を errors へ追記する。
 * tMs → input → confidence → origin の順に、1 件の中でも見つかった不正をすべて挙げる。
 */
function collectStepErrors(raw: unknown, path: string, errors: ChartParseError[]): void {
  if (!isPlainObject(raw)) {
    errors.push(shapeError(path, 'ステップはオブジェクトである必要があります'));
    return;
  }

  if (typeof raw.tMs !== 'number' || !Number.isFinite(raw.tMs) || raw.tMs < 0) {
    errors.push({ kind: 'out_of_range', path: `${path}.tMs`, value: raw.tMs });
  }

  if (!isButtonType(raw.input)) {
    errors.push({ kind: 'invalid_button_type', path: `${path}.input`, value: raw.input });
  }

  const confidence = raw.confidence;
  if (
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    errors.push({ kind: 'out_of_range', path: `${path}.confidence`, value: confidence });
  }

  if (!isChartStepOrigin(raw.origin)) {
    errors.push(shapeError(`${path}.origin`, "origin は 'auto' または 'manual' である必要があります"));
  }
}

/** tMs 昇順の不変条件を検証する。並べ替えて黙って直すことはしない */
function collectOrderErrors(steps: readonly unknown[], errors: ChartParseError[]): void {
  let previous: number | null = null;

  for (const [index, raw] of steps.entries()) {
    if (!isPlainObject(raw) || typeof raw.tMs !== 'number' || !Number.isFinite(raw.tMs)) {
      previous = null;
      continue;
    }
    if (previous !== null && raw.tMs < previous) {
      errors.push(shapeError(`steps[${index}].tMs`, 'steps は tMs 昇順である必要があります'));
    }
    previous = raw.tMs;
  }
}

/**
 * 任意の値を譜面として検証する。呼び出し側での事前検証は前提としない。
 *
 * 不正は最初の 1 件で打ち切らず、場所（path）付きですべて列挙する。
 * ただしバージョンが受け入れ不能な場合だけは、以降のフィールドの意味が
 * 保証されないため検証を打ち切る。
 */
export function parseChart(input: unknown): ChartParseResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [shapeError('', '譜面はオブジェクトである必要があります')],
    };
  }

  if (input.version !== CHART_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [{ kind: 'unsupported_version', found: input.version }],
    };
  }

  const errors: ChartParseError[] = [];
  collectSourceErrors(input.source, errors);

  const rawSteps = input.steps;
  if (!Array.isArray(rawSteps)) {
    errors.push(shapeError('steps', 'steps は配列である必要があります'));
    return { ok: false, errors };
  }

  for (const [index, rawStep] of rawSteps.entries()) {
    collectStepErrors(rawStep, `steps[${index}]`, errors);
  }
  collectOrderErrors(rawSteps, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, chart: toChart(input, rawSteps) };
}

/** 検証を通過した生データを Chart へ写す。未知のフィールドは落とす */
function toChart(input: Record<string, unknown>, rawSteps: readonly unknown[]): Chart {
  const rawSource = input.source as Record<string, unknown>;
  const source: ChartSource = {
    type: rawSource.type as ChartSourceType,
    offsetMs: rawSource.offsetMs as number,
    ...(typeof rawSource.videoId === 'string' ? { videoId: rawSource.videoId } : {}),
    ...(typeof rawSource.fileName === 'string' ? { fileName: rawSource.fileName } : {}),
  };

  const steps: ChartStep[] = rawSteps.map((raw) => {
    const step = raw as Record<string, unknown>;
    return {
      tMs: step.tMs as number,
      input: step.input as ButtonType,
      confidence: step.confidence as number,
      origin: step.origin as ChartStepOrigin,
    };
  });

  return { version: CHART_FORMAT_VERSION, source, steps };
}
