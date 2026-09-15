import { describe, it, expect } from 'vitest';
import {
  FRAME_DURATION_MS,
  UNDO_LIMIT,
  MAX_SCAN_DURATION_MS,
  MAX_WEAPON_SLOTS,
  MAX_CALIBRATION_ENTRIES,
  CALIBRATION_STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  CHART_AUTHOR_DRAFT_VERSION,
  GLYPH_GRID_SIZE,
  GLYPH_DESCRIPTOR_LENGTH,
  EMPTY_GLYPH,
  DEFAULT_ANALYSIS_PARAMS,
} from '@/features/chart-author/constants';
import type { AnalysisParams } from '@/features/chart-author/types';

describe('コマ送りと走査の単位', () => {
  it('コマ送りの単位時間は 30fps 相当', () => {
    expect(FRAME_DURATION_MS).toBe(1000 / 30);
  });

  it('走査可能な最大尺は 10 分', () => {
    expect(MAX_SCAN_DURATION_MS).toBe(10 * 60 * 1000);
  });
});

describe('編集と校正の上限', () => {
  it('Undo の上限は 20 件', () => {
    expect(UNDO_LIMIT).toBe(20);
  });

  it('武器スロットは最大 5 件', () => {
    expect(MAX_WEAPON_SLOTS).toBe(5);
  });

  it('保存する校正エントリは最大 10 件', () => {
    expect(MAX_CALIBRATION_ENTRIES).toBe(10);
  });
});

describe('永続化キー', () => {
  it('校正と下書きで別のキーを使う', () => {
    expect(CALIBRATION_STORAGE_KEY).toBe('ct_chart_author_calibrations');
    expect(DRAFT_STORAGE_KEY).toBe('ct_chart_author_draft');
    expect(CALIBRATION_STORAGE_KEY).not.toBe(DRAFT_STORAGE_KEY);
  });

  it('下書きはバージョン付きで保存する', () => {
    expect(CHART_AUTHOR_DRAFT_VERSION).toBe(1);
  });
});

describe('グリフ記述子', () => {
  it('特徴ベクトルの長さはグリッドのセル数と一致する', () => {
    expect(GLYPH_DESCRIPTOR_LENGTH).toBe(GLYPH_GRID_SIZE * GLYPH_GRID_SIZE);
  });

  it('空セルを表すクラスタ識別子が定義されている', () => {
    expect(typeof EMPTY_GLYPH).toBe('string');
    expect(EMPTY_GLYPH.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_ANALYSIS_PARAMS', () => {
  it('設計で定めた既定値を持つ', () => {
    expect(DEFAULT_ANALYSIS_PARAMS).toEqual({
      boostDropThreshold: 0.06,
      boostDropWindowMs: 100,
      chargeLuminanceThreshold: 0.55,
      chargeMinOnFrames: 2,
      sustainedFireGapMs: 150,
      glyphMatchDistance: 0.18,
    });
  });

  it('AnalysisParams の全フィールドを埋めている', () => {
    const params: AnalysisParams = DEFAULT_ANALYSIS_PARAMS;
    expect(Object.keys(params).sort()).toEqual([
      'boostDropThreshold',
      'boostDropWindowMs',
      'chargeLuminanceThreshold',
      'chargeMinOnFrames',
      'glyphMatchDistance',
      'sustainedFireGapMs',
    ]);
  });

  it('閾値は 0..1、時間窓とフレーム数は正', () => {
    expect(DEFAULT_ANALYSIS_PARAMS.boostDropThreshold).toBeGreaterThan(0);
    expect(DEFAULT_ANALYSIS_PARAMS.boostDropThreshold).toBeLessThanOrEqual(1);
    expect(DEFAULT_ANALYSIS_PARAMS.chargeLuminanceThreshold).toBeGreaterThan(0);
    expect(DEFAULT_ANALYSIS_PARAMS.chargeLuminanceThreshold).toBeLessThanOrEqual(1);
    expect(DEFAULT_ANALYSIS_PARAMS.glyphMatchDistance).toBeGreaterThan(0);
    expect(DEFAULT_ANALYSIS_PARAMS.boostDropWindowMs).toBeGreaterThan(0);
    expect(DEFAULT_ANALYSIS_PARAMS.sustainedFireGapMs).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_ANALYSIS_PARAMS.chargeMinOnFrames)).toBe(true);
    expect(DEFAULT_ANALYSIS_PARAMS.chargeMinOnFrames).toBeGreaterThanOrEqual(1);
  });
});
