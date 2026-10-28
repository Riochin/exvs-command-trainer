'use client';

/**
 * 表示中の動画フレームから、正規化矩形ぶんの画素を 1 回だけ取り出す。
 *
 * 校正画面のボタン表示の推定（Req 2.3）にしか使わない、その場限りの読み出し。
 * 走査の `regionSampler` とは用途が違う（あちらは毎フレーム・複数領域を
 * 効率よく読む）ので、canvas を持ち回らず呼び出しごとに捨てる。
 *
 * canvas を持たない環境では推定を諦めて null を返す。推定できないスロットは
 * 校正画面が「手で選んでください」と示すので、ここで無理に埋めない。
 *
 * 要素そのものではなく ref を受け取る。呼ばれるのは矩形を描き終えた時点で、
 * そのとき画面に載っている動画から読む必要があるため。
 */
import type { RefObject } from 'react';
import type { PixelRegion, Rect } from '../types';

export function sampleVideoRegion(
  videoRef: RefObject<HTMLVideoElement | null>,
  rect: Rect,
): PixelRegion | null {
  const video = videoRef.current;
  if (video === null) return null;

  const frameWidth = video.videoWidth;
  const frameHeight = video.videoHeight;
  if (frameWidth <= 0 || frameHeight <= 0) return null;

  const width = Math.max(1, Math.round(rect.width * frameWidth));
  const height = Math.max(1, Math.round(rect.height * frameHeight));
  const x = Math.round(rect.x * frameWidth);
  const y = Math.round(rect.y * frameHeight);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) return null;

    context.drawImage(video, x, y, width, height, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    return { width, height, data: new Uint8ClampedArray(imageData.data) };
  } catch {
    // 描画も読み出しも失敗しうる（canvas 非対応・まだ 1 フレームも描かれていない等）
    return null;
  }
}
