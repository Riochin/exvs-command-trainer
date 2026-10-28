import { describe, it, expect } from 'vitest';
import type {
  Rect,
  SlotId,
  GlyphKey,
  VideoKey,
  GlyphDescriptor,
  GlyphTemplate,
  GlyphBank,
  SlotSample,
  FrameSample,
  SampleTimeline,
  AnalysisParams,
  ShootingInputType,
  ChargeKind,
  WeaponSlotCalibration,
  HudCalibration,
  CalibrationDefect,
  CalibrationValidation,
  DetectedStep,
  DetectionSummary,
  EditorStep,
  EditorState,
  EditorAction,
  StepFilter,
  RerunStrategy,
  ChartAuthorDraft,
  WorkflowPhase,
} from '@/features/chart-author/types';
import { EMPTY_GLYPH, GLYPH_DESCRIPTOR_LENGTH } from '@/features/chart-author/constants';
import type { ButtonType } from '@/types';

const videoKey: VideoKey = {
  fileName: 'clip.mp4',
  durationMs: 120_000,
  width: 1920,
  height: 1080,
};

const rect: Rect = { x: 0.1, y: 0.8, width: 0.05, height: 0.04 };

const descriptor: GlyphDescriptor = {
  features: Array.from({ length: GLYPH_DESCRIPTOR_LENGTH }, () => 0),
  inkRatio: 0.3,
};

const glyphBank: GlyphBank = {
  templates: [{ key: 'g0', descriptor, digit: 7, previewDataUrl: null } satisfies GlyphTemplate],
};

describe('Rect - 解像度非依存の正規化座標', () => {
  it('矩形は 0..1 の比率で表す', () => {
    const values = [rect.x, rect.y, rect.width, rect.height];
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('VideoKey - 動画の同一性の照合キー', () => {
  it('ファイル名・尺・解像度の 3 点で構成する', () => {
    expect(Object.keys(videoKey).sort()).toEqual(['durationMs', 'fileName', 'height', 'width']);
  });
});

describe('スロット校正', () => {
  it('射撃系の入力種別だけを取りうる', () => {
    const inputTypes: ShootingInputType[] = ['shot', 'sub', 'special-shot', 'special-melee'];
    expect(inputTypes).toHaveLength(4);

    // 格闘はスロット由来の入力種別にならない（Req 3.8）
    // @ts-expect-error melee は ShootingInputType に含まれない
    const invalid: ShootingInputType = 'melee';
    expect(invalid).toBe('melee');
  });

  it('CHARGE 種別は射撃系か格闘系の 2 値', () => {
    const kinds: ChargeKind[] = ['shot', 'melee'];
    expect(kinds).toEqual(['shot', 'melee']);
  });

  it('CHARGE とボタン表示の矩形は未指定を取りうる', () => {
    const slotId: SlotId = 'slot-0';
    const slot: WeaponSlotCalibration = {
      id: slotId,
      index: 0,
      inputType: 'shot',
      inputTypeSource: 'auto',
      ammoRect: rect,
      digitCount: 2,
      buttonIndicatorRect: null,
      chargeRect: null,
      chargeKind: null,
    };

    expect(slot.chargeRect).toBeNull();
    expect(slot.buttonIndicatorRect).toBeNull();
  });

  it('HUD 校正は動画キー・スロット列・ブースト矩形・グリフ辞書を持つ', () => {
    const calibration: HudCalibration = {
      videoKey,
      createdAt: '2026-09-15T00:00:00.000Z',
      slots: [],
      boostRect: rect,
      glyphBank,
    };

    expect(calibration.slots).toEqual([]);
    expect(calibration.glyphBank.templates).toHaveLength(1);
  });

  it('校正の不備は種類ごとに区別できる', () => {
    const defects: CalibrationDefect[] = [
      { kind: 'no_weapon_slot' },
      { kind: 'no_boost_gauge' },
      { kind: 'slot_missing_ammo_rect', slotId: 'slot-0' },
      { kind: 'slot_invalid_digit_count', slotId: 'slot-0' },
      { kind: 'charge_kind_missing', slotId: 'slot-0' },
    ];

    expect(defects.map((d) => d.kind)).toHaveLength(5);

    const validation: CalibrationValidation = { ok: false, defects };
    expect(validation.ok).toBe(false);
  });
});

describe('走査の中間表現', () => {
  it('桁セルは左詰めのクラスタ識別子列で、空セルは EMPTY_GLYPH', () => {
    const emptyKey: GlyphKey = EMPTY_GLYPH;
    const sample: SlotSample = {
      slotId: 'slot-0',
      digits: ['g0', emptyKey],
      chargeOn: false,
      chargeMargin: 0.2,
    };

    expect(sample.digits[1]).toBe(EMPTY_GLYPH);
  });

  it('タイムラインは欠測区間と打ち切りフラグを明示的に保持する', () => {
    const frame: FrameSample = {
      tMs: 0,
      slots: [],
      boostFill: 1,
    };
    const timeline: SampleTimeline = {
      videoKey,
      frameDurationMs: 1000 / 30,
      samples: [frame],
      gaps: [[100, 200]],
      glyphBank,
      truncated: false,
    };

    expect(timeline.gaps[0]).toEqual([100, 200]);
    expect(timeline.truncated).toBe(false);
  });
});

describe('検出結果', () => {
  it('検出器の由来と確認事由を添えて返す', () => {
    const detectors: DetectedStep['detector'][] = ['ammo', 'charge', 'boost'];
    const caveats: DetectedStep['caveat'][] = [
      'none',
      'direction_unknown',
      'across_gap',
      'low_margin',
    ];

    expect(detectors).toHaveLength(3);
    expect(caveats).toHaveLength(4);

    const step: DetectedStep = {
      tMs: 1000,
      input: 'shot',
      confidence: 0.95,
      detector: 'ammo',
      caveat: 'none',
    };
    expect(step.detector).toBe('ammo');
  });

  it('集計は入力種別ごとの件数と総数を持つ', () => {
    const summary: DetectionSummary = { countsByInput: { shot: 3, bd: 1 }, total: 4 };
    expect(summary.total).toBe(4);
  });
});

describe('編集用ステップ', () => {
  it('譜面ステップに編集用 ID と由来を足した形', () => {
    const step: EditorStep = {
      id: 'step-1',
      tMs: 1000,
      input: 'shot',
      confidence: 1,
      origin: 'manual',
      detector: null,
      caveat: 'none',
    };

    expect(step.id).toBe('step-1');
    expect(step.detector).toBeNull();
  });

  it('編集アクションは全種類を判別可能な形で表す', () => {
    const input: ButtonType = 'bd';
    const strategy: RerunStrategy = 'replace_auto_only';
    const actions: EditorAction[] = [
      { type: 'ADD_STEP', tMs: 0, input },
      { type: 'REMOVE_STEP', id: 'step-1' },
      { type: 'NUDGE_STEP', id: 'step-1', frames: -1 },
      { type: 'CHANGE_INPUT', id: 'step-1', input },
      { type: 'APPLY_GLOBAL_OFFSET', offsetMs: 100 },
      { type: 'ADOPT_DETECTIONS', steps: [], strategy },
      { type: 'REPLACE_ALL', steps: [] },
    ];

    expect(actions.map((a) => a.type)).toEqual([
      'ADD_STEP',
      'REMOVE_STEP',
      'NUDGE_STEP',
      'CHANGE_INPUT',
      'APPLY_GLOBAL_OFFSET',
      'ADOPT_DETECTIONS',
      'REPLACE_ALL',
    ]);
  });

  it('編集状態と絞り込み条件を表せる', () => {
    const state: EditorState = { steps: [], selectedId: null };
    const filter: StepFilter = { inputs: null, origins: ['auto'], minConfidence: 0 };

    expect(state.selectedId).toBeNull();
    expect(filter.origins).toEqual(['auto']);
  });
});

describe('下書きとワークフロー', () => {
  it('下書きは動画キー無しでも保存できる', () => {
    const draft: ChartAuthorDraft = {
      version: 1,
      videoKey: null,
      source: { type: 'file', offsetMs: 0 },
      steps: [],
      savedAt: '2026-09-15T00:00:00.000Z',
    };

    expect(draft.videoKey).toBeNull();
  });

  it('ワークフローの各段階を表せる', () => {
    const phases: WorkflowPhase[] = [
      'idle',
      'loaded',
      'calibrating',
      'ready',
      'scanning',
      'resolving',
      'editing',
    ];

    expect(phases).toHaveLength(7);
  });
});

describe('AnalysisParams', () => {
  it('解析パラメータを外から与えられる', () => {
    const params: AnalysisParams = {
      boostDropThreshold: 0.1,
      boostDropWindowMs: 120,
      chargeLuminanceThreshold: 0.6,
      chargeMinOnFrames: 3,
      sustainedFireGapMs: 200,
      glyphMatchDistance: 0.2,
    };

    expect(params.chargeMinOnFrames).toBe(3);
  });
});
