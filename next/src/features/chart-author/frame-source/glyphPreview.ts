/**
 * 桁セルの画素を、人が見られる小さな画像へ写す。
 *
 * グリフのクラスタは記述子（特徴ベクトル）でしか区別されない。人に数字を
 * 尋ねる（GlyphTutor）には、そのクラスタが実際どう見えていたのかを見せる
 * しかない。画素を画像へ変えるのは描画の仕事なので、DOM に触れるこの層が持つ。
 *
 * 作るのはクラスタが新しくできた瞬間だけ。毎フレーム作ると走査が保たない。
 */
import type { PixelRegion } from '../types';

/** canvas のうち、この処理が使う部分だけ。テストはフェイクを渡す */
export type PreviewContext = {
  createImageData(width: number, height: number): ImageData;
  putImageData(imageData: ImageData, dx: number, dy: number): void;
};

export type PreviewCanvas = {
  width: number;
  height: number;
  getContext(contextId: '2d'): PreviewContext | null;
  toDataURL(type?: string): string;
};

function defaultCanvas(): PreviewCanvas | null {
  if (typeof document === 'undefined') return null;
  return document.createElement('canvas') as unknown as PreviewCanvas;
}

/**
 * 画素領域を PNG の data URL にする。作れなければ null。
 *
 * 失敗しても走査は続ける。プレビューが無くても数字は入力できるので、
 * ここで例外を投げて解析そのものを止める理由がない。
 */
export function createGlyphPreview(
  region: PixelRegion,
  createCanvas: () => PreviewCanvas | null = defaultCanvas,
): string | null {
  if (region.width <= 0 || region.height <= 0) return null;

  try {
    const canvas = createCanvas();
    if (canvas === null) return null;

    canvas.width = region.width;
    canvas.height = region.height;

    const context = canvas.getContext('2d');
    if (context === null) return null;

    const imageData = context.createImageData(region.width, region.height);
    imageData.data.set(region.data);
    context.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/png');
  } catch {
    // canvas 非対応・書き出し拒否など。プレビューは諦めて走査を続ける
    return null;
  }
}
