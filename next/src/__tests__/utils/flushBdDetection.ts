import { act } from '@testing-library/react';
import { BD_WINDOW_MS } from '@/features/arcade-controller/ArcadeController';

/** ジャンプの BD 判定タイマーが満了するまで実タイマー環境で待つ */
export async function flushBdDetection() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, BD_WINDOW_MS + 15);
    });
  });
}
