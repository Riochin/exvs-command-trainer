import { act } from '@testing-library/react';
import { SIMULTANEOUS_INPUT_DEFER_MS } from '@/features/arcade-controller/ArcadeController';

/** 射撃・格闘の tap/charge が遅延発火するため、実タイマー環境で結果を待つ */
export async function flushChargeDeferredInput() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, SIMULTANEOUS_INPUT_DEFER_MS + 15);
    });
  });
}
