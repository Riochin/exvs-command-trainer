import { describe, it, expect } from 'vitest';
import { attachGlyphPreview } from '@/features/chart-author/analysis/glyphBank';
import type { GlyphBank, GlyphTemplate } from '@/features/chart-author/types';

function template(patch: Partial<GlyphTemplate> & { key: string }): GlyphTemplate {
  return {
    descriptor: { features: [0.5], inkRatio: 0.5 },
    digit: null,
    previewDataUrl: null,
    ...patch,
  };
}

const BANK: GlyphBank = {
  templates: [template({ key: 'g1' }), template({ key: 'g2' })],
};

describe('attachGlyphPreview', () => {
  it('指定したクラスタに切り出し画像を持たせる', () => {
    const next = attachGlyphPreview(BANK, 'g2', 'data:image/png;base64,AAA');

    expect(next.templates[1].previewDataUrl).toBe('data:image/png;base64,AAA');
  });

  it('ほかのクラスタには触れない', () => {
    const next = attachGlyphPreview(BANK, 'g2', 'data:image/png;base64,AAA');

    expect(next.templates[0]).toBe(BANK.templates[0]);
  });

  it('元の束を書き換えない', () => {
    attachGlyphPreview(BANK, 'g2', 'data:image/png;base64,AAA');

    expect(BANK.templates[1].previewDataUrl).toBeNull();
  });

  it('数字のラベルは保ったままにする', () => {
    const labeled: GlyphBank = { templates: [template({ key: 'g1', digit: 7 })] };

    const next = attachGlyphPreview(labeled, 'g1', 'data:image/png;base64,AAA');

    expect(next.templates[0].digit).toBe(7);
  });

  it('知らないクラスタを指されたら何も変えない', () => {
    const next = attachGlyphPreview(BANK, 'g9', 'data:image/png;base64,AAA');

    expect(next).toBe(BANK);
  });
});
