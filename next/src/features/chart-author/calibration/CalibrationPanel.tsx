'use client';

/**
 * HUD 校正の操作画面。
 *
 * 動画の上に重なる矩形描画（CalibrationOverlay）と対になる、動画の外側の
 * 操作面。描く対象の切り替え、スロットごとの上書き、そして「まだ解析を
 * 始められない理由」をここで見せる。
 *
 * 解析開始を塞ぐ判断そのものは持たない。可否は useCalibrationStore の
 * 検証が単独で所有し（Req 2.5）、ここはその結果を表示に落とすだけにする。
 */
import { MAX_WEAPON_SLOTS } from '../constants';
import type { CalibrationDefect, SlotId } from '../types';
import styles from './CalibrationPanel.module.css';
import { SlotInspector } from './SlotInspector';
import type { UseCalibrationDrawReturn } from './useCalibrationDraw';
import type { UseCalibrationStoreReturn } from './useCalibrationStore';

export type CalibrationPanelProps = {
  readonly store: UseCalibrationStoreReturn;
  readonly draw: UseCalibrationDrawReturn;
  onStartAnalysis(): void;
};

/** 不足の理由を、次に何をすればよいかが分かる文言にする */
function describeDefect(
  defect: CalibrationDefect,
  numberOf: (slotId: SlotId) => number,
): string {
  switch (defect.kind) {
    case 'no_weapon_slot':
      return '武器スロットが 1 件もありません（弾数表示をドラッグしてください）';
    case 'no_boost_gauge':
      return 'ブーストゲージの領域が指定されていません';
    case 'slot_missing_ammo_rect':
      return `スロット ${numberOf(defect.slotId)} の弾数領域に広がりがありません`;
    case 'slot_invalid_digit_count':
      return `スロット ${numberOf(defect.slotId)} の桁数が不正です`;
    case 'charge_kind_missing':
      return `スロット ${numberOf(defect.slotId)} の CHARGE 種別が未設定です`;
  }
}

export function CalibrationPanel({ store, draw, onStartAnalysis }: CalibrationPanelProps) {
  const { calibration, reusable, reusableMatchesVideo } = store;
  const slots = calibration?.slots ?? [];
  const validation = store.validate();
  const ready = validation.ok;
  const editable = calibration !== null;

  const numberOf = (slotId: SlotId): number =>
    (slots.find((slot) => slot.id === slotId)?.index ?? 0) + 1;

  return (
    <section className={styles.panel} data-testid="calibration-panel">
      <h2 className={styles.heading}>HUD 校正</h2>

      {reusable !== null && (
        <div className={styles.reuse} data-testid="calibration-reuse">
          <p className={styles.reuseText}>
            同じファイル名の校正が保存されています
            {reusableMatchesVideo ? '' : '（尺か解像度が違うため適用できません）'}
          </p>
          <button
            type="button"
            className={styles.button}
            onClick={store.adoptReusable}
            disabled={!reusableMatchesVideo}
          >
            保存済みの校正を使う
          </button>
        </div>
      )}

      <div className={styles.targets}>
        <button
          type="button"
          className={draw.target.kind === 'slot_ammo' ? styles.targetActive : styles.target}
          onClick={() => draw.setTarget({ kind: 'slot_ammo' })}
          disabled={!editable || slots.length >= MAX_WEAPON_SLOTS}
          aria-label="新しいスロットの弾数領域を描く"
        >
          ＋ 弾数領域（{slots.length}/{MAX_WEAPON_SLOTS}）
        </button>
        <button
          type="button"
          className={draw.target.kind === 'boost' ? styles.targetActive : styles.target}
          onClick={() => draw.setTarget({ kind: 'boost' })}
          disabled={!editable}
          aria-label="ブーストゲージを描く"
        >
          ブーストゲージ
        </button>
        <span className={styles.active}>描画中: {draw.activeLabel}</span>
      </div>

      <SlotInspector
        slots={slots}
        classifications={draw.classifications}
        onUpdateSlot={store.updateSlot}
        onRemoveSlot={store.removeSlot}
        onSelectTarget={draw.setTarget}
      />

      {!ready && (
        <ul className={styles.defects} data-testid="calibration-defects">
          {validation.defects.map((defect) => (
            <li key={`${defect.kind}-${'slotId' in defect ? defect.slotId : ''}`}>
              {describeDefect(defect, numberOf)}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={styles.start}
        data-testid="calibration-start"
        onClick={onStartAnalysis}
        disabled={!ready}
      >
        解析を開始
      </button>
    </section>
  );
}
