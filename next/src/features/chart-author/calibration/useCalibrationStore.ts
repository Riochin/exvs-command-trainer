'use client';

/**
 * 校正データの検証と、動画を跨いだ再利用。
 *
 * 「解析を始められる校正か」の判定はここが単独で所有する（Req 2.5）。不足は
 * 最初の 1 件で打ち切らず、すべて列挙して返す。どこを直せば始められるのかが
 * 1 度で分かる必要があるため。
 *
 * 再利用はファイル名で引く。ただしファイル名の一致だけでは同じ動画とは
 * 言えない（切り出し方や録画設定が違えば HUD の位置も違う）ので、適用は
 * 尺と解像度まで一致したものに限り、しかも必ずユーザーが選ぶ（Req 2.6）。
 */
import { useCallback, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { StorageResult } from '@/types';
import {
  CALIBRATION_STORAGE_KEY,
  MAX_CALIBRATION_ENTRIES,
  MAX_WEAPON_SLOTS,
} from '../constants';
import type {
  CalibrationDefect,
  GlyphBank,
  CalibrationValidation,
  HudCalibration,
  Rect,
  SlotId,
  VideoKey,
  WeaponSlotCalibration,
} from '../types';

export interface UseCalibrationStoreReturn {
  readonly calibration: HudCalibration | null;
  /** 同名ファイルの保存済み校正。再利用を提案する対象（Req 2.6） */
  readonly reusable: HudCalibration | null;
  /** 候補が尺と解像度まで一致しているか。一致しない候補は適用できない */
  readonly reusableMatchesVideo: boolean;
  validate(): CalibrationValidation;
  updateSlot(slotId: SlotId, patch: Partial<WeaponSlotCalibration>): void;
  addSlot(rect: Rect): SlotId;
  removeSlot(slotId: SlotId): void;
  setBoostRect(rect: Rect): void;
  /** 解決済みのグリフ束を校正へ載せる。保存すれば次の走査の出発点になる */
  setGlyphBank(bank: GlyphBank): void;
  /**
   * グリフ束を載せたうえで保存する。
   * 載せてから `persist` を続けて呼ぶと 1 つ前の校正を書いてしまうため、
   * 「載せて保存する」を 1 つの操作として持つ。
   */
  saveGlyphBank(bank: GlyphBank): StorageResult<HudCalibration>;
  adoptReusable(): void;
  persist(): StorageResult<HudCalibration>;
}

type CalibrationEntries = Record<string, HudCalibration>;

/** 未指定の矩形。型としては常に存在するので、広がりの有無で指定済みかを見る */
const UNSET_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** 新しいスロットの既定桁数。弾数表示は 2 桁が最も多い */
const DEFAULT_DIGIT_COUNT = 2;

/** まだ校正が無いのに保存を求められたときの答え */
const NOTHING_TO_SAVE: StorageResult<HudCalibration> = {
  ok: false,
  error: { type: 'write_error', message: '保存できる校正がありません' },
};

function hasArea(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function sameVideo(a: VideoKey, b: VideoKey): boolean {
  return (
    a.fileName === b.fileName &&
    a.durationMs === b.durationMs &&
    a.width === b.width &&
    a.height === b.height
  );
}

function emptyCalibration(videoKey: VideoKey): HudCalibration {
  return {
    videoKey,
    createdAt: new Date().toISOString(),
    slots: [],
    boostRect: UNSET_RECT,
    glyphBank: { templates: [] },
  };
}

/** 削除や並べ替えのあとで index を 0 からの連番に貼り直す */
function reindex(
  slots: readonly WeaponSlotCalibration[],
): readonly WeaponSlotCalibration[] {
  return slots.map((slot, index) => (slot.index === index ? slot : { ...slot, index }));
}

export function collectDefects(
  calibration: HudCalibration | null,
): readonly CalibrationDefect[] {
  if (calibration === null) return [{ kind: 'no_weapon_slot' }, { kind: 'no_boost_gauge' }];

  const defects: CalibrationDefect[] = [];
  if (calibration.slots.length === 0) defects.push({ kind: 'no_weapon_slot' });
  if (!hasArea(calibration.boostRect)) defects.push({ kind: 'no_boost_gauge' });

  for (const slot of calibration.slots) {
    if (!hasArea(slot.ammoRect)) {
      defects.push({ kind: 'slot_missing_ammo_rect', slotId: slot.id });
    }
    if (!Number.isInteger(slot.digitCount) || slot.digitCount < 1) {
      defects.push({ kind: 'slot_invalid_digit_count', slotId: slot.id });
    }
    // CHARGE 領域は「ある場合」に限る（Req 2.2）。未指定自体は不備ではない
    if (slot.chargeRect !== null && slot.chargeKind === null) {
      defects.push({ kind: 'charge_kind_missing', slotId: slot.id });
    }
  }

  return defects;
}

/** 保持している校正が、いま読み込まれている動画のものでなくなっているか */
function isStale(calibration: HudCalibration | null, videoKey: VideoKey | null): boolean {
  if (videoKey === null) return calibration !== null;
  return calibration === null || !sameVideo(calibration.videoKey, videoKey);
}

export function useCalibrationStore(videoKey: VideoKey | null): UseCalibrationStoreReturn {
  const entries = useLocalStorage<CalibrationEntries>(CALIBRATION_STORAGE_KEY, {});
  const [calibration, setCalibration] = useState<HudCalibration | null>(null);

  /**
   * 動画が変わったら白紙から始める。前の動画の矩形を引き継ぐと、位置が
   * 合っていないのに校正済みに見えてしまう。
   *
   * 描画中に調整するのは、効果で後追いすると「前の動画の校正を返す描画」が
   * 1 回挟まるため。React が同じ描画の中でやり直すので余分な描画は残らない。
   */
  if (isStale(calibration, videoKey)) {
    setCalibration(videoKey === null ? null : emptyCalibration(videoKey));
  }

  const reusable = useMemo(
    () => (videoKey === null ? null : (entries.value[videoKey.fileName] ?? null)),
    [entries.value, videoKey],
  );

  const reusableMatchesVideo =
    reusable !== null && videoKey !== null && sameVideo(reusable.videoKey, videoKey);

  const validate = useCallback((): CalibrationValidation => {
    const defects = collectDefects(calibration);
    if (defects.length > 0 || calibration === null) return { ok: false, defects };
    return { ok: true, calibration };
  }, [calibration]);

  const addSlot = useCallback((rect: Rect): SlotId => {
    const id = uuidv4();
    setCalibration((previous) => {
      if (previous === null) return previous;
      if (previous.slots.length >= MAX_WEAPON_SLOTS) return previous;
      const slot: WeaponSlotCalibration = {
        id,
        index: previous.slots.length,
        // 推定は buttonIndicatorRect が与えられてから。ここでは最も素直な種別に置く
        inputType: 'shot',
        inputTypeSource: 'auto',
        ammoRect: rect,
        digitCount: DEFAULT_DIGIT_COUNT,
        buttonIndicatorRect: null,
        chargeRect: null,
        chargeKind: null,
      };
      return { ...previous, slots: [...previous.slots, slot] };
    });
    return id;
  }, []);

  const updateSlot = useCallback((slotId: SlotId, patch: Partial<WeaponSlotCalibration>) => {
    setCalibration((previous) => {
      if (previous === null) return previous;
      if (!previous.slots.some((slot) => slot.id === slotId)) return previous;
      return {
        ...previous,
        slots: previous.slots.map((slot) =>
          // id と index はスロットの同一性そのものなので patch に踏ませない
          slot.id === slotId ? { ...slot, ...patch, id: slot.id, index: slot.index } : slot,
        ),
      };
    });
  }, []);

  const removeSlot = useCallback((slotId: SlotId) => {
    setCalibration((previous) => {
      if (previous === null) return previous;
      const slots = previous.slots.filter((slot) => slot.id !== slotId);
      if (slots.length === previous.slots.length) return previous;
      return { ...previous, slots: reindex(slots) };
    });
  }, []);

  const setBoostRect = useCallback((rect: Rect) => {
    setCalibration((previous) =>
      previous === null ? previous : { ...previous, boostRect: rect },
    );
  }, []);

  const setGlyphBank = useCallback((bank: GlyphBank) => {
    setCalibration((previous) => (previous === null ? previous : { ...previous, glyphBank: bank }));
  }, []);

  const adoptReusable = useCallback(() => {
    // 尺と解像度まで一致したものだけを適用する。ファイル名の一致は提案の根拠にしかならない
    if (!reusableMatchesVideo || reusable === null) return;
    setCalibration(reusable);
  }, [reusable, reusableMatchesVideo]);

  /** 渡された校正をそのまま書く。何を保存するかは呼び出し側が決める */
  const write = useCallback(
    (target: HudCalibration): StorageResult<HudCalibration> => {
      const entry: HudCalibration = { ...target, createdAt: new Date().toISOString() };
      const next: CalibrationEntries = {
        ...entries.value,
        [entry.videoKey.fileName]: entry,
      };

      // glyphBank を同梱するので 1 件が大きい。古い順に捨てて容量超過を避ける
      const byAge = Object.keys(next).sort((a, b) =>
        next[a].createdAt.localeCompare(next[b].createdAt),
      );
      for (const fileName of byAge.slice(0, Math.max(0, byAge.length - MAX_CALIBRATION_ENTRIES))) {
        delete next[fileName];
      }

      const written = entries.setValue(next);
      return written.ok ? { ok: true, value: entry } : written;
    },
    [entries],
  );

  const persist = useCallback(
    (): StorageResult<HudCalibration> =>
      calibration === null ? NOTHING_TO_SAVE : write(calibration),
    [calibration, write],
  );

  const saveGlyphBank = useCallback(
    (bank: GlyphBank): StorageResult<HudCalibration> => {
      if (calibration === null) return NOTHING_TO_SAVE;
      const next: HudCalibration = { ...calibration, glyphBank: bank };
      setCalibration(next);
      return write(next);
    },
    [calibration, write],
  );

  return {
    calibration,
    reusable,
    reusableMatchesVideo,
    validate,
    updateSlot,
    addSlot,
    removeSlot,
    setBoostRect,
    setGlyphBank,
    saveGlyphBank,
    adoptReusable,
    persist,
  };
}
