/**
 * 譜面作成ツールの定数。
 *
 * コマ送りの単位・各種上限・永続化キー・解析パラメータの既定値を
 * この 1 箇所に集約する。値を散らすと解析層と UI 層で食い違うため。
 */
import type { AnalysisParams } from './types';

/** コマ送りの単位時間。30fps 相当 */
export const FRAME_DURATION_MS = 1000 / 30;

/** Undo スタックに積む逆アクションの上限。超過分は古い方から捨てる */
export const UNDO_LIMIT = 20;

/** 走査を許可する動画の最大尺。これを超えるとメモリを圧迫する */
export const MAX_SCAN_DURATION_MS = 10 * 60 * 1000;

/** HUD に並ぶ武器スロットの最大数 */
export const MAX_WEAPON_SLOTS = 5;

/** localStorage に保持する校正エントリの上限。超過時は古い順に破棄する */
export const MAX_CALIBRATION_ENTRIES = 10;

/** 校正の永続化キー。`Record<fileName, HudCalibration>` を保持する */
export const CALIBRATION_STORAGE_KEY = 'ct_chart_author_calibrations';

/** 作業中譜面の永続化キー */
export const DRAFT_STORAGE_KEY = 'ct_chart_author_draft';

/** 下書きフォーマットのバージョン。譜面フォーマットとは独立に上げる */
export const CHART_AUTHOR_DRAFT_VERSION = 1;

/** グリフ記述子を取るときに桁セルを分割するグリッドの一辺 */
export const GLYPH_GRID_SIZE = 8;

/** 特徴ベクトルの長さ。グリッドのセル数に一致する */
export const GLYPH_DESCRIPTOR_LENGTH = GLYPH_GRID_SIZE * GLYPH_GRID_SIZE;

/** 何も描かれていない桁セルに割り当てるクラスタ識別子 */
export const EMPTY_GLYPH = 'empty';

/** 解析パラメータの既定値。UI のスライダはこの値から始まる */
export const DEFAULT_ANALYSIS_PARAMS: AnalysisParams = {
  boostDropThreshold: 0.06,
  boostDropWindowMs: 100,
  chargeLuminanceThreshold: 0.55,
  chargeMinOnFrames: 2,
  sustainedFireGapMs: 150,
  glyphMatchDistance: 0.18,
};
