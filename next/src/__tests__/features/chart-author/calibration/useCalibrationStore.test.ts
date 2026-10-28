import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCalibrationStore } from '@/features/chart-author/calibration/useCalibrationStore';
import {
  CALIBRATION_STORAGE_KEY,
  MAX_CALIBRATION_ENTRIES,
  MAX_WEAPON_SLOTS,
} from '@/features/chart-author/constants';
import type { StorageResult } from '@/types';
import type {
  CalibrationDefect,
  HudCalibration,
  Rect,
  VideoKey,
} from '@/features/chart-author/types';

const VIDEO: VideoKey = {
  fileName: 'battle.mp4',
  durationMs: 60_000,
  width: 1920,
  height: 1080,
};

const AMMO_RECT: Rect = { x: 0.8, y: 0.2, width: 0.06, height: 0.04 };
const BOOST_RECT: Rect = { x: 0.3, y: 0.9, width: 0.4, height: 0.02 };

function storedCalibration(patch: Partial<HudCalibration> = {}): HudCalibration {
  return {
    videoKey: VIDEO,
    createdAt: '2026-01-01T00:00:00.000Z',
    slots: [
      {
        id: 'slot-stored',
        index: 0,
        inputType: 'sub',
        inputTypeSource: 'manual',
        ammoRect: AMMO_RECT,
        digitCount: 2,
        buttonIndicatorRect: null,
        chargeRect: null,
        chargeKind: null,
      },
    ],
    boostRect: BOOST_RECT,
    glyphBank: { templates: [] },
    ...patch,
  };
}

function seedStorage(entries: Readonly<Record<string, HudCalibration>>): void {
  window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(entries));
}

function readStorage(): Record<string, HudCalibration> {
  const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, HudCalibration>);
}

function defectKinds(defects: readonly CalibrationDefect[]): readonly string[] {
  return defects.map((defect) => defect.kind);
}

/** 必須領域が揃った校正まで組み立てた状態で返す */
function renderReady(videoKey: VideoKey = VIDEO) {
  const rendered = renderHook(() => useCalibrationStore(videoKey));
  act(() => {
    rendered.result.current.addSlot(AMMO_RECT);
    rendered.result.current.setBoostRect(BOOST_RECT);
  });
  return rendered;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useCalibrationStore - 検証', () => {
  it('武器スロットもブーストゲージもない校正は不足項目を両方列挙する', () => {
    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    const validation = result.current.validate();

    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(defectKinds(validation.defects)).toEqual(['no_weapon_slot', 'no_boost_gauge']);
  });

  it('ブーストゲージだけ欠けている場合はそれだけを報告する', () => {
    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    act(() => void result.current.addSlot(AMMO_RECT));

    const validation = result.current.validate();
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(defectKinds(validation.defects)).toEqual(['no_boost_gauge']);
  });

  it('必須領域が揃えば検証を通過し、校正そのものを返す', () => {
    const { result } = renderReady();

    const validation = result.current.validate();

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.calibration.slots).toHaveLength(1);
    expect(validation.calibration.boostRect).toEqual(BOOST_RECT);
  });

  it('弾数領域に広がりがないスロットを不備として報告する', () => {
    const { result } = renderReady();
    const slotId = result.current.calibration?.slots[0].id ?? '';

    act(() =>
      result.current.updateSlot(slotId, {
        ammoRect: { x: 0.8, y: 0.2, width: 0, height: 0 },
      }),
    );

    const validation = result.current.validate();
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.defects).toEqual([{ kind: 'slot_missing_ammo_rect', slotId }]);
  });

  it('桁数が不正なスロットを不備として報告する', () => {
    const { result } = renderReady();
    const slotId = result.current.calibration?.slots[0].id ?? '';

    act(() => result.current.updateSlot(slotId, { digitCount: 0 }));

    const validation = result.current.validate();
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.defects).toEqual([{ kind: 'slot_invalid_digit_count', slotId }]);
  });

  it('CHARGE 領域があるのに種別が未設定のスロットを不備として報告する', () => {
    const { result } = renderReady();
    const slotId = result.current.calibration?.slots[0].id ?? '';

    act(() =>
      result.current.updateSlot(slotId, {
        chargeRect: { x: 0.9, y: 0.3, width: 0.03, height: 0.02 },
      }),
    );

    const validation = result.current.validate();
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.defects).toEqual([{ kind: 'charge_kind_missing', slotId }]);
  });

  it('CHARGE 領域が指定されていないこと自体は不備としない', () => {
    const { result } = renderReady();

    expect(result.current.calibration?.slots[0].chargeRect).toBeNull();
    expect(result.current.validate().ok).toBe(true);
  });
});

describe('useCalibrationStore - スロットの編集', () => {
  it('矩形を渡すとスロットが増え、並び順が連番になる', () => {
    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    act(() => {
      result.current.addSlot(AMMO_RECT);
      result.current.addSlot(AMMO_RECT);
    });

    expect(result.current.calibration?.slots.map((slot) => slot.index)).toEqual([0, 1]);
  });

  it('スロットは上限を超えて増えない', () => {
    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    act(() => {
      for (let i = 0; i < MAX_WEAPON_SLOTS + 2; i += 1) result.current.addSlot(AMMO_RECT);
    });

    expect(result.current.calibration?.slots).toHaveLength(MAX_WEAPON_SLOTS);
  });

  it('スロットを削除すると並び順が詰められる', () => {
    const { result } = renderHook(() => useCalibrationStore(VIDEO));
    act(() => {
      result.current.addSlot(AMMO_RECT);
      result.current.addSlot(AMMO_RECT);
      result.current.addSlot(AMMO_RECT);
    });
    const removedId = result.current.calibration?.slots[1].id ?? '';

    act(() => result.current.removeSlot(removedId));

    const slots = result.current.calibration?.slots ?? [];
    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => slot.index)).toEqual([0, 1]);
    expect(slots.some((slot) => slot.id === removedId)).toBe(false);
  });

  it('存在しないスロットへの更新は何も変えない', () => {
    const { result } = renderReady();
    const before = result.current.calibration;

    act(() => result.current.updateSlot('unknown', { digitCount: 3 }));

    expect(result.current.calibration).toBe(before);
  });
});

describe('useCalibrationStore - 永続化と再利用', () => {
  it('校正をファイル名で引ける形で保存する', () => {
    const { result } = renderReady();

    let saved: StorageResult<HudCalibration> | undefined;
    act(() => {
      saved = result.current.persist();
    });

    expect(saved?.ok).toBe(true);
    expect(Object.keys(readStorage())).toEqual(['battle.mp4']);
  });

  it('保存件数が上限を超えたら古いものから捨てる', () => {
    const seeded: Record<string, HudCalibration> = {};
    for (let i = 0; i < MAX_CALIBRATION_ENTRIES; i += 1) {
      const fileName = `old-${i}.mp4`;
      seeded[fileName] = storedCalibration({
        videoKey: { ...VIDEO, fileName },
        // 添字が小さいほど古い
        createdAt: `2020-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      });
    }
    seedStorage(seeded);

    const { result } = renderReady();
    act(() => void result.current.persist());

    const stored = readStorage();
    expect(Object.keys(stored)).toHaveLength(MAX_CALIBRATION_ENTRIES);
    expect(stored['old-0.mp4']).toBeUndefined();
    expect(stored['battle.mp4']).toBeDefined();
  });

  it('同名ファイルの保存済み校正を再利用の候補として返す', () => {
    seedStorage({ 'battle.mp4': storedCalibration() });

    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    expect(result.current.reusable?.slots[0].id).toBe('slot-stored');
  });

  it('再利用の候補を自動では適用しない', () => {
    seedStorage({ 'battle.mp4': storedCalibration() });

    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    expect(result.current.calibration?.slots).toHaveLength(0);
    expect(result.current.validate().ok).toBe(false);
  });

  it('尺と解像度まで一致していれば、選ばれたときに適用する', () => {
    seedStorage({ 'battle.mp4': storedCalibration() });
    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    expect(result.current.reusableMatchesVideo).toBe(true);
    act(() => result.current.adoptReusable());

    expect(result.current.calibration?.slots[0].id).toBe('slot-stored');
    expect(result.current.validate().ok).toBe(true);
  });

  it('ファイル名だけが一致する校正は適用しない', () => {
    seedStorage({
      'battle.mp4': storedCalibration({
        videoKey: { ...VIDEO, durationMs: 12_000 },
      }),
    });
    const { result } = renderHook(() => useCalibrationStore(VIDEO));

    expect(result.current.reusable).not.toBeNull();
    expect(result.current.reusableMatchesVideo).toBe(false);

    act(() => result.current.adoptReusable());
    expect(result.current.calibration?.slots).toHaveLength(0);
  });

  it('動画が読み込まれていなければ校正を持たない', () => {
    const { result } = renderHook(() => useCalibrationStore(null));

    expect(result.current.calibration).toBeNull();
    expect(result.current.reusable).toBeNull();
    expect(result.current.persist().ok).toBe(false);
  });
});
