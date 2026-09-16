import { describe, it, expect, vi } from 'vitest';
import {
  createGlyphPreview,
  type PreviewCanvas,
  type PreviewContext,
} from '@/features/chart-author/frame-source/glyphPreview';
import type { PixelRegion } from '@/features/chart-author/types';

/** 左半分だけ明るい 4x2 の領域 */
function region(): PixelRegion {
  const width = 4;
  const height = 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x < 2 ? 255 : 0;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

type FakeCanvas = PreviewCanvas & {
  readonly written: ImageData[];
  readonly toDataURL: ReturnType<typeof vi.fn>;
};

function fakeCanvas(options: { context?: boolean; dataUrl?: string } = {}): FakeCanvas {
  const written: ImageData[] = [];
  const context: PreviewContext = {
    createImageData: (width, height) =>
      ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
        colorSpace: 'srgb',
      }) as ImageData,
    putImageData: (imageData) => void written.push(imageData),
  };

  return {
    width: 0,
    height: 0,
    written,
    getContext: () => (options.context === false ? null : context),
    toDataURL: vi.fn(() => options.dataUrl ?? 'data:image/png;base64,PREVIEW'),
  };
}

describe('createGlyphPreview', () => {
  it('切り出した画素を data URL として返す', () => {
    const canvas = fakeCanvas();

    const url = createGlyphPreview(region(), () => canvas);

    expect(url).toBe('data:image/png;base64,PREVIEW');
  });

  it('canvas を桁セルと同じ大きさに合わせる', () => {
    const canvas = fakeCanvas();

    createGlyphPreview(region(), () => canvas);

    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(2);
  });

  it('元の画素をそのまま書き込む', () => {
    const canvas = fakeCanvas();
    const source = region();

    createGlyphPreview(source, () => canvas);

    expect(canvas.written).toHaveLength(1);
    expect(Array.from(canvas.written[0].data)).toEqual(Array.from(source.data));
  });

  it('png として書き出す', () => {
    const canvas = fakeCanvas();

    createGlyphPreview(region(), () => canvas);

    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('2d コンテキストが取れない環境では null を返す', () => {
    const url = createGlyphPreview(region(), () => fakeCanvas({ context: false }));

    expect(url).toBeNull();
  });

  it('canvas を用意できない環境では null を返す', () => {
    const url = createGlyphPreview(region(), () => null);

    expect(url).toBeNull();
  });

  it('書き出しに失敗しても例外を投げない', () => {
    const canvas = fakeCanvas();
    canvas.toDataURL.mockImplementation(() => {
      throw new Error('tainted canvas');
    });

    expect(createGlyphPreview(region(), () => canvas)).toBeNull();
  });

  it('大きさを持たない領域は画像にしない', () => {
    const canvas = fakeCanvas();

    const url = createGlyphPreview(
      { width: 0, height: 0, data: new Uint8ClampedArray(0) },
      () => canvas,
    );

    expect(url).toBeNull();
  });
});
