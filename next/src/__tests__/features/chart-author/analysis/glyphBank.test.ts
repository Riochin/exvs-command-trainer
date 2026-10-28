import { describe, it, expect } from 'vitest';
import {
  EMPTY_BANK,
  assignGlyph,
  labelGlyph,
  resolveGlyphValue,
  unresolvedGlyphs,
} from '@/features/chart-author/analysis/glyphBank';
import { EMPTY_GLYPH, GLYPH_DESCRIPTOR_LENGTH } from '@/features/chart-author/constants';
import type { GlyphBank, GlyphDescriptor } from '@/features/chart-author/types';

const MAX_DISTANCE = 0.18;

/** 先頭 n セルだけが 1 の記述子。n を変えれば距離が開く */
function descriptor(filledCells: number, inkRatio = 0.3): GlyphDescriptor {
  const features = new Array<number>(GLYPH_DESCRIPTOR_LENGTH).fill(0);
  for (let i = 0; i < filledCells; i += 1) features[i] = 1;
  return { features, inkRatio };
}

/** 記述子を順に登録し、最後の bank と割り当てられたキー列を返す */
function assignAll(
  descriptors: readonly GlyphDescriptor[],
): { bank: GlyphBank; keys: string[] } {
  let bank = EMPTY_BANK;
  const keys: string[] = [];
  for (const d of descriptors) {
    const result = assignGlyph(bank, d, MAX_DISTANCE);
    bank = result.bank;
    keys.push(result.key);
  }
  return { bank, keys };
}

describe('assignGlyph', () => {
  it('同一の記述子は同じクラスタへ割り当てられる', () => {
    const { bank, keys } = assignAll([descriptor(10), descriptor(10)]);
    expect(keys[0]).toBe(keys[1]);
    expect(bank.templates).toHaveLength(1);
  });

  it('許容距離を超えて異なる記述子は別クラスタになる', () => {
    const { bank, keys } = assignAll([descriptor(0, 0.3), descriptor(64)]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(bank.templates).toHaveLength(2);
  });

  it('許容距離の内側にある記述子は既存クラスタへ吸収される', () => {
    // 64 セル中 1 セルだけ違う → 距離 = sqrt(1/64) = 0.125 < 0.18
    const { bank, keys } = assignAll([descriptor(10), descriptor(11)]);
    expect(keys[0]).toBe(keys[1]);
    expect(bank.templates).toHaveLength(1);
  });

  it('空セルの記述子はクラスタを作らず EMPTY_GLYPH を返す', () => {
    const result = assignGlyph(EMPTY_BANK, descriptor(0, 0), MAX_DISTANCE);
    expect(result.key).toBe(EMPTY_GLYPH);
    expect(result.bank.templates).toHaveLength(0);
  });

  it('bank を変更せず、常に新しい bank を返す', () => {
    const result = assignGlyph(EMPTY_BANK, descriptor(10), MAX_DISTANCE);
    expect(EMPTY_BANK.templates).toHaveLength(0);
    expect(result.bank).not.toBe(EMPTY_BANK);
  });

  it('既存クラスタに合致した場合は bank をそのまま返す', () => {
    const first = assignGlyph(EMPTY_BANK, descriptor(10), MAX_DISTANCE);
    const second = assignGlyph(first.bank, descriptor(10), MAX_DISTANCE);
    expect(second.bank).toBe(first.bank);
  });

  it('最も近いクラスタを選ぶ', () => {
    const { bank } = assignAll([descriptor(0, 0.3), descriptor(64)]);
    const near = assignGlyph(bank, descriptor(63), MAX_DISTANCE);
    expect(near.key).toBe(bank.templates[1].key);
  });
});

describe('unresolvedGlyphs / labelGlyph', () => {
  it('ラベル未付与のクラスタを一覧できる', () => {
    const { bank } = assignAll([descriptor(0, 0.3), descriptor(64)]);
    expect(unresolvedGlyphs(bank)).toHaveLength(2);
  });

  it('ラベルを与えたクラスタは未解決一覧から外れる', () => {
    const { bank } = assignAll([descriptor(0, 0.3), descriptor(64)]);
    const labeled = labelGlyph(bank, bank.templates[0].key, 7);
    expect(unresolvedGlyphs(labeled)).toHaveLength(1);
    expect(labeled.templates[0].digit).toBe(7);
  });

  it('ラベル付与は元の bank を変更しない', () => {
    const { bank } = assignAll([descriptor(10)]);
    labelGlyph(bank, bank.templates[0].key, 3);
    expect(bank.templates[0].digit).toBeNull();
  });

  it('存在しないキーへのラベル付与は bank を変えない', () => {
    const { bank } = assignAll([descriptor(10)]);
    expect(labelGlyph(bank, 'unknown', 3)).toBe(bank);
  });

  it('0..9 の範囲外のラベルは無視する', () => {
    const { bank } = assignAll([descriptor(10)]);
    expect(labelGlyph(bank, bank.templates[0].key, 10)).toBe(bank);
    expect(labelGlyph(bank, bank.templates[0].key, -1)).toBe(bank);
  });
});

describe('resolveGlyphValue', () => {
  /** 数字 0..2 をラベル済みにした bank と、そのキーを返す */
  function labeledBank(): { bank: GlyphBank; keys: string[] } {
    const { bank, keys } = assignAll([descriptor(0, 0.3), descriptor(32), descriptor(64)]);
    let resolved = bank;
    keys.forEach((key, i) => {
      resolved = labelGlyph(resolved, key, i);
    });
    return { bank: resolved, keys };
  }

  it('ラベル済みの桁列を整数へ解決する', () => {
    const { bank, keys } = labeledBank();
    expect(resolveGlyphValue(bank, [keys[1], keys[2]])).toBe(12);
  });

  it('1 桁の桁列も解決する', () => {
    const { bank, keys } = labeledBank();
    expect(resolveGlyphValue(bank, [keys[0]])).toBe(0);
  });

  it('末尾の空セルは桁として数えない', () => {
    const { bank, keys } = labeledBank();
    expect(resolveGlyphValue(bank, [keys[1], EMPTY_GLYPH, EMPTY_GLYPH])).toBe(1);
  });

  it('未解決のクラスタを含む桁列は解決しない', () => {
    const { bank, keys } = labeledBank();
    const withUnlabeled = assignGlyph(bank, descriptor(48), MAX_DISTANCE);
    expect(resolveGlyphValue(withUnlabeled.bank, [keys[1], withUnlabeled.key])).toBeNull();
  });

  it('bank に無いキーを含む桁列は解決しない', () => {
    const { bank, keys } = labeledBank();
    expect(resolveGlyphValue(bank, [keys[1], 'missing'])).toBeNull();
  });

  it('桁の途中に空セルが挟まる桁列は解決しない', () => {
    const { bank, keys } = labeledBank();
    expect(resolveGlyphValue(bank, [keys[1], EMPTY_GLYPH, keys[2]])).toBeNull();
  });

  it('すべて空セルの桁列は解決しない', () => {
    const { bank } = labeledBank();
    expect(resolveGlyphValue(bank, [EMPTY_GLYPH, EMPTY_GLYPH])).toBeNull();
    expect(resolveGlyphValue(bank, [])).toBeNull();
  });
});
