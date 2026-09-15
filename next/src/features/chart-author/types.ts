/**
 * 譜面作成ツール内部の型。
 *
 * ここに置くのはツールの中だけで意味を持つ概念（校正・走査の中間表現・
 * 編集用ステップ）に限る。ツールの外へ出る譜面フォーマットは `@/types/chart`
 * が所有し、この層はそれを import して使う。
 */
import type { ButtonType } from '@/types';
import type { ChartSource, ChartStep, ChartStepOrigin } from '@/types/chart';

/** 動画フレームに対する正規化座標（0..1）。解像度変化に耐えるため比率で保持する */
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type SlotId = string;

/** グリフのクラスタ識別子。数字としての意味はまだ持たない */
export type GlyphKey = string;

/** 同一動画であることの照合キー。ファイル名だけでは不十分なため尺と解像度を併用する */
export type VideoKey = {
  readonly fileName: string;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
};

// --- グリフ ---------------------------------------------------------------

export type GlyphDescriptor = {
  /** 正規化済みの特徴ベクトル。長さは GLYPH_DESCRIPTOR_LENGTH で固定 */
  readonly features: readonly number[];
  /** 描画インクの割合 0..1。空セル判定に使う */
  readonly inkRatio: number;
};

export type GlyphTemplate = {
  readonly key: GlyphKey;
  readonly descriptor: GlyphDescriptor;
  /** 未ラベルなら null */
  readonly digit: number | null;
  /** GlyphTutor 表示用の小さな切り出し画像（data URL） */
  readonly previewDataUrl: string | null;
};

export type GlyphBank = {
  readonly templates: readonly GlyphTemplate[];
};

// --- 走査の中間表現 -------------------------------------------------------

export type SlotSample = {
  readonly slotId: SlotId;
  /** 桁セルごとのクラスタ識別子。左詰め。空表示のセルは EMPTY_GLYPH */
  readonly digits: readonly GlyphKey[];
  readonly chargeOn: boolean;
  /** CHARGE 判定の余裕度。閾値からの距離を 0..1 に正規化した値 */
  readonly chargeMargin: number;
};

export type FrameSample = {
  readonly tMs: number;
  readonly slots: readonly SlotSample[];
  /** ブーストゲージの充填率 0..1 */
  readonly boostFill: number;
};

export type SampleTimeline = {
  readonly videoKey: VideoKey;
  readonly frameDurationMs: number;
  readonly samples: readonly FrameSample[];
  /** 走査でスキップされた区間。[開始tMs, 終了tMs) の配列 */
  readonly gaps: readonly (readonly [number, number])[];
  readonly glyphBank: GlyphBank;
  /** キャンセルで打ち切られた場合 true */
  readonly truncated: boolean;
};

/** 検出の挙動を外から調整するパラメータ。既定値は constants.ts が持つ */
export type AnalysisParams = {
  /** ブースト急減とみなす充填率の低下量 */
  readonly boostDropThreshold: number;
  /** 急減を判定する時間窓（ms） */
  readonly boostDropWindowMs: number;
  /** CHARGE 点灯とみなす正規化輝度 */
  readonly chargeLuminanceThreshold: number;
  /** 点灯確定に要する連続フレーム数 */
  readonly chargeMinOnFrames: number;
  /** 連射を 1 ステップに畳む間隔（ms） */
  readonly sustainedFireGapMs: number;
  /** グリフ照合の許容距離 */
  readonly glyphMatchDistance: number;
};

// --- 校正 -----------------------------------------------------------------

/** スロット由来で検出しうる入力種別。格闘（melee）は画面からは判定しない */
export type ShootingInputType = Extract<
  ButtonType,
  'shot' | 'sub' | 'special-shot' | 'special-melee'
>;

export type ChargeKind = 'shot' | 'melee';

export type WeaponSlotCalibration = {
  readonly id: SlotId;
  /** HUD 上での並び順 0..4 */
  readonly index: number;
  readonly inputType: ShootingInputType;
  readonly inputTypeSource: 'auto' | 'manual';
  readonly ammoRect: Rect;
  readonly digitCount: number;
  readonly buttonIndicatorRect: Rect | null;
  readonly chargeRect: Rect | null;
  readonly chargeKind: ChargeKind | null;
};

export type HudCalibration = {
  readonly videoKey: VideoKey;
  readonly createdAt: string;
  readonly slots: readonly WeaponSlotCalibration[];
  readonly boostRect: Rect;
  readonly glyphBank: GlyphBank;
};

export type CalibrationDefect =
  | { readonly kind: 'no_weapon_slot' }
  | { readonly kind: 'no_boost_gauge' }
  | { readonly kind: 'slot_missing_ammo_rect'; readonly slotId: SlotId }
  | { readonly kind: 'slot_invalid_digit_count'; readonly slotId: SlotId }
  | { readonly kind: 'charge_kind_missing'; readonly slotId: SlotId };

export type CalibrationValidation =
  | { readonly ok: true; readonly calibration: HudCalibration }
  | { readonly ok: false; readonly defects: readonly CalibrationDefect[] };

// --- 検出結果 -------------------------------------------------------------

/** 検出器が返す、まだ編集用 ID を持たないステップ */
export type DetectedStep = {
  readonly tMs: number;
  readonly input: ButtonType;
  readonly confidence: number;
  /** 由来する検出器。UI での候補表示と再解析時のマージ判定に使う */
  readonly detector: 'ammo' | 'charge' | 'boost';
  /** 方向が確定していない弾数変化など、確認を要する理由 */
  readonly caveat: 'none' | 'direction_unknown' | 'across_gap' | 'low_margin';
};

export type DetectionSummary = {
  /** 入力種別ごとの件数 */
  readonly countsByInput: Readonly<Record<string, number>>;
  readonly total: number;
};

// --- 編集 -----------------------------------------------------------------

/** 編集中のステップ。id はエクスポート時に落とされる */
export type EditorStep = ChartStep & {
  readonly id: string;
  readonly detector: DetectedStep['detector'] | null;
  readonly caveat: DetectedStep['caveat'];
};

export type StepFilter = {
  readonly inputs: readonly ButtonType[] | null;
  readonly origins: readonly ChartStepOrigin[] | null;
  readonly minConfidence: number;
};

/** 再解析時のマージ方針 */
export type RerunStrategy = 'replace_auto_only' | 'discard_all';

export type EditorAction =
  | { readonly type: 'ADD_STEP'; readonly tMs: number; readonly input: ButtonType }
  | { readonly type: 'REMOVE_STEP'; readonly id: string }
  | { readonly type: 'NUDGE_STEP'; readonly id: string; readonly frames: number }
  | { readonly type: 'CHANGE_INPUT'; readonly id: string; readonly input: ButtonType }
  | { readonly type: 'APPLY_GLOBAL_OFFSET'; readonly offsetMs: number }
  | {
      readonly type: 'ADOPT_DETECTIONS';
      readonly steps: readonly DetectedStep[];
      readonly strategy: RerunStrategy;
    }
  | { readonly type: 'REPLACE_ALL'; readonly steps: readonly EditorStep[] };

export type EditorState = {
  readonly steps: readonly EditorStep[];
  readonly selectedId: string | null;
};

/** 適用結果と、それを打ち消すアクションの組 */
export type ReducerOutcome = {
  readonly next: EditorState;
  readonly inverse: EditorAction | null;
};

// --- 永続化とワークフロー -------------------------------------------------

export type ChartAuthorDraft = {
  readonly version: number;
  /** どの動画に対する作業かの手がかり。再選択時の照合に使う */
  readonly videoKey: VideoKey | null;
  readonly source: ChartSource;
  readonly steps: readonly EditorStep[];
  readonly savedAt: string;
};

/** ツール全体のワークフロー段階 */
export type WorkflowPhase =
  | 'idle'
  | 'loaded'
  | 'calibrating'
  | 'ready'
  | 'scanning'
  | 'resolving'
  | 'editing';
