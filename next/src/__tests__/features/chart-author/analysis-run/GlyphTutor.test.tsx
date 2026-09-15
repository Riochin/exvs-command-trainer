import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlyphTutor } from '@/features/chart-author/analysis-run/GlyphTutor';
import type { GlyphTemplate } from '@/features/chart-author/types';

function template(patch: Partial<GlyphTemplate> = {}): GlyphTemplate {
  return {
    key: 'g1',
    descriptor: { features: [0.5], inkRatio: 0.5 },
    digit: null,
    previewDataUrl: null,
    ...patch,
  };
}

let onLabel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onLabel = vi.fn();
});

function renderTutor(glyphs: readonly GlyphTemplate[]) {
  return render(<GlyphTutor glyphs={glyphs} onLabel={onLabel} />);
}

describe('GlyphTutor', () => {
  it('未解決のクラスタごとに切り出し画像を見せる', () => {
    renderTutor([
      template({ key: 'g1', previewDataUrl: 'data:image/png;base64,AAA' }),
      template({ key: 'g2', previewDataUrl: 'data:image/png;base64,BBB' }),
    ]);

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('data:image/png;base64,AAA');
  });

  it('切り出し画像が無いクラスタでも数字を入力できる', () => {
    renderTutor([template({ previewDataUrl: null })]);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('glyph-no-preview-g1')).toBeDefined();
    expect(screen.getByRole('button', { name: 'g1 を 3 として登録' })).toBeDefined();
  });

  it('数字を選ぶとラベルとして通知する', () => {
    renderTutor([template({ key: 'g2' })]);

    fireEvent.click(screen.getByRole('button', { name: 'g2 を 7 として登録' }));

    expect(onLabel).toHaveBeenCalledWith('g2', 7);
  });

  it('0 から 9 までを選べる', () => {
    renderTutor([template()]);

    const digits = screen
      .getAllByTestId('glyph-digit-g1')
      .map((button) => button.textContent);
    expect(digits).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('残りの件数を示す', () => {
    renderTutor([template({ key: 'g1' }), template({ key: 'g2' })]);

    expect(screen.getByTestId('glyph-remaining').textContent).toContain('2');
  });

  it('未解決が無ければ何も出さない', () => {
    const { container } = renderTutor([]);

    expect(container.firstChild).toBeNull();
  });
});
