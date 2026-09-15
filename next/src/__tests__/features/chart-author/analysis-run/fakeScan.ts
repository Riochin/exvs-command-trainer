/**
 * 走査のテストが使う擬似フレーム供給と擬似画素取り出し。
 *
 * jsdom は動画のデコードも canvas も持たないので、走査の駆動を確かめるには
 * この 2 つを差し替えるしかない。フレームは 1 枚ずつテストから流し込み、
 * 「途中でキャンセルする」のような時間の絡む筋書きを手で組み立てられるようにする。
 */
import type {
  FrameHandle,
  FrameSource,
  RegionSamplerService,
  SampledRegions,
} from '@/features/chart-author/frame-source/types';
import type { HudCalibration, PixelRegion } from '@/features/chart-author/types';

/** マイクロタスクとタイマーを 1 巡させる */
export async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 一様な明るさの領域。CHARGE の輝度や空の桁セルに使う */
export function solidRegion(value: number, width = 8, height = 8): PixelRegion {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** 左から `fill` の割合だけ明るい横長領域。ブーストゲージの充填率に使う */
export function gaugeRegion(fill: number, width = 10, height = 4): PixelRegion {
  const lit = Math.round(fill * width);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x < lit ? 255 : 0;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 上半分だけが明るい桁セル。空ではないグリフとしてクラスタを作らせる */
export function inkedRegion(width = 8, height = 8): PixelRegion {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = y < height / 2 ? 255 : 0;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** フレーム 1 枚ぶんの見え方。省略した項目は既定の見え方になる */
export type FrameLook = {
  /** ブーストゲージの充填率 0..1 */
  readonly boostFill?: number;
  /** CHARGE 領域の明るさ 0..255 */
  readonly chargeValue?: number;
  /** 桁セルにインクを載せるか */
  readonly inked?: boolean;
};

export type FakeSampler = RegionSamplerService & {
  /** sample が受け取った (フレーム番号, 校正) の履歴 */
  readonly calls: { readonly index: number; readonly calibration: HudCalibration }[];
  isDisposed(): boolean;
};

export function createFakeSampler(look: (index: number) => FrameLook = () => ({})): FakeSampler {
  const calls: { index: number; calibration: HudCalibration }[] = [];
  let disposed = false;

  return {
    calls,
    isDisposed: () => disposed,
    sample(frame, calibration): SampledRegions {
      const index = (frame as unknown as { index: number }).index;
      calls.push({ index, calibration });
      const spec = look(index);

      return {
        slots: calibration.slots.map((slot) => ({
          slotId: slot.id,
          ammoCells: Array.from({ length: slot.digitCount }, () =>
            spec.inked === true ? inkedRegion() : solidRegion(0),
          ),
          charge: slot.chargeRect === null ? null : solidRegion(spec.chargeValue ?? 0),
          buttonIndicator: null,
        })),
        boost: gaugeRegion(spec.boostFill ?? 1),
      };
    },
    dispose() {
      disposed = true;
    },
  };
}

export type ManualFrameSource = {
  readonly source: FrameSource;
  /** フレームを 1 枚流し、走査側が処理し終えるまで待つ */
  deliver(tMs: number, skippedFrames?: number): Promise<void>;
  /** 連番のフレームをまとめて流す */
  deliverMany(count: number, frameDurationMs: number): Promise<void>;
  /** 供給の終端を伝える */
  finish(): Promise<void>;
  isDisposed(): boolean;
};

export type ManualFrameSourceOptions = {
  readonly durationMs?: number;
  readonly frameDurationMs?: number;
  readonly kind?: FrameSource['kind'];
};

export function createManualFrameSource(
  options: ManualFrameSourceOptions = {},
): ManualFrameSource {
  const durationMs = options.durationMs ?? 1000;
  const frameDurationMs = options.frameDurationMs ?? 100;

  const pending: FrameHandle[] = [];
  let ended = false;
  let disposed = false;
  let index = 0;
  let wake: (() => void) | null = null;

  const notify = (): void => {
    const resume = wake;
    wake = null;
    resume?.();
  };

  async function* frames(signal: AbortSignal): AsyncIterableIterator<FrameHandle> {
    const onAbort = (): void => notify();
    signal.addEventListener('abort', onAbort);
    try {
      while (true) {
        while (pending.length === 0 && !ended && !signal.aborted) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
        if (signal.aborted) return;
        const next = pending.shift();
        if (next === undefined) return;
        yield next;
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  const source: FrameSource = {
    kind: options.kind ?? 'playback',
    durationMs,
    frameDurationMs,
    frames,
    dispose() {
      disposed = true;
    },
  };

  return {
    source,
    isDisposed: () => disposed,
    async deliver(tMs, skippedFrames = 0) {
      pending.push({
        tMs,
        skippedFrames,
        source: { index: index++ } as unknown as CanvasImageSource,
      });
      notify();
      await tick();
    },
    async deliverMany(count, step) {
      for (let i = 0; i < count; i += 1) await this.deliver(i * step);
    },
    async finish() {
      ended = true;
      notify();
      await tick();
    },
  };
}
