'use client';

/**
 * 校正画面の「いま何を描いているか」と、描き終えた矩形の行き先。
 *
 * 矩形を作る側（CalibrationOverlay）と、スロットを編集する側
 * （SlotInspector / CalibrationPanel）は同じ動画の上に並ぶが親子ではない。
 * 両者が参照する状態をここに置き、画面の組み立て（ChartAuthorApp）は
 * 配線だけを行えばよいようにする。
 *
 * 入力種別の推定もここで起こす。推定に要る画素の取り出しは DOM に触れる
 * 仕事なので、関数として外から受け取り、このフック自体は DOM を知らない。
 */
import { useCallback, useMemo, useState } from 'react';
import type { PixelRegion, Rect, SlotId } from '../types';
import { classifySlotInputType, type SlotClassification } from './slotClassifier';
import type { UseCalibrationStoreReturn } from './useCalibrationStore';

export type DrawTarget =
  | { readonly kind: 'slot_ammo' }
  | { readonly kind: 'slot_indicator'; readonly slotId: SlotId }
  | { readonly kind: 'slot_charge'; readonly slotId: SlotId }
  | { readonly kind: 'boost' };

export type OverlayRectVariant = 'ammo' | 'indicator' | 'charge' | 'boost';

export type OverlayRect = {
  readonly id: string;
  readonly label: string;
  readonly variant: OverlayRectVariant;
  readonly rect: Rect;
};

/** 現在フレームから指定領域の画素を取り出す。DOM を持たない環境では省略される */
export type SampleIndicator = (rect: Rect) => PixelRegion | null;

export interface UseCalibrationDrawReturn {
  readonly target: DrawTarget;
  readonly rects: readonly OverlayRect[];
  readonly activeLabel: string;
  /** スロットごとの推定結果。推定できなかったスロットは null */
  readonly classifications: Readonly<Record<SlotId, SlotClassification | null>>;
  setTarget(target: DrawTarget): void;
  draw(rect: Rect): void;
}

const INITIAL_TARGET: DrawTarget = { kind: 'slot_ammo' };

/** 人が読む並び順はスロット番号。index は 0 始まりなので表示では 1 を足す */
function slotNumber(index: number): number {
  return index + 1;
}

function hasArea(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

export function labelForTarget(
  target: DrawTarget,
  slotIndexById: Readonly<Record<SlotId, number>>,
): string {
  switch (target.kind) {
    case 'slot_ammo':
      return '新しいスロットの弾数領域';
    case 'slot_indicator':
      return `スロット ${slotNumber(slotIndexById[target.slotId] ?? 0)} のボタン表示領域`;
    case 'slot_charge':
      return `スロット ${slotNumber(slotIndexById[target.slotId] ?? 0)} の CHARGE 領域`;
    case 'boost':
      return 'ブーストゲージ';
  }
}

export function useCalibrationDraw(
  store: UseCalibrationStoreReturn,
  sampleIndicator?: SampleIndicator,
): UseCalibrationDrawReturn {
  const [target, setTarget] = useState<DrawTarget>(INITIAL_TARGET);
  const [classifications, setClassifications] = useState<
    Readonly<Record<SlotId, SlotClassification | null>>
  >({});

  const { calibration } = store;

  const slotIndexById = useMemo(() => {
    const map: Record<SlotId, number> = {};
    for (const slot of calibration?.slots ?? []) map[slot.id] = slot.index;
    return map;
  }, [calibration]);

  const rects = useMemo((): readonly OverlayRect[] => {
    if (calibration === null) return [];
    const collected: OverlayRect[] = [];

    for (const slot of calibration.slots) {
      const number = slotNumber(slot.index);
      collected.push({
        id: `${slot.id}-ammo`,
        label: `スロット ${number} 弾数`,
        variant: 'ammo',
        rect: slot.ammoRect,
      });
      if (slot.buttonIndicatorRect !== null) {
        collected.push({
          id: `${slot.id}-indicator`,
          label: `スロット ${number} ボタン`,
          variant: 'indicator',
          rect: slot.buttonIndicatorRect,
        });
      }
      if (slot.chargeRect !== null) {
        collected.push({
          id: `${slot.id}-charge`,
          label: `スロット ${number} CHARGE`,
          variant: 'charge',
          rect: slot.chargeRect,
        });
      }
    }

    if (hasArea(calibration.boostRect)) {
      collected.push({
        id: 'boost',
        label: 'ブースト',
        variant: 'boost',
        rect: calibration.boostRect,
      });
    }

    return collected;
  }, [calibration]);

  const draw = useCallback(
    (rect: Rect) => {
      switch (target.kind) {
        case 'slot_ammo': {
          const slotId = store.addSlot(rect);
          // 弾数の次に要るのは種別を決めるボタン表示。描く順番を案内する
          setTarget({ kind: 'slot_indicator', slotId });
          return;
        }
        case 'slot_indicator': {
          store.updateSlot(target.slotId, { buttonIndicatorRect: rect });
          const region = sampleIndicator?.(rect) ?? null;
          const classification = region === null ? null : classifySlotInputType(region);
          setClassifications((previous) => ({
            ...previous,
            [target.slotId]: classification,
          }));
          // 推定できなかったときに既定値で塗り潰さない。上書きはユーザーの仕事
          if (classification !== null) {
            store.updateSlot(target.slotId, {
              inputType: classification.inputType,
              inputTypeSource: 'auto',
            });
          }
          return;
        }
        case 'slot_charge':
          store.updateSlot(target.slotId, { chargeRect: rect });
          return;
        case 'boost':
          store.setBoostRect(rect);
      }
    },
    [sampleIndicator, store, target],
  );

  return {
    target,
    rects,
    activeLabel: labelForTarget(target, slotIndexById),
    classifications,
    setTarget,
    draw,
  };
}
