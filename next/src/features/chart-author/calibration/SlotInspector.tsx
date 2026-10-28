'use client';

/**
 * スロットごとの入力種別・桁数・CHARGE 種別の編集。
 *
 * 推定（slotClassifier）はあくまで提案であり、実映像で丸の配置や色が
 * 想定と違えば外れる。ここでの上書きが唯一の保険なので、確からしさが
 * 低いスロットと推定できなかったスロットは必ず目に付く形で示す（Req 2.3, 2.4）。
 */
import { LOW_CLASSIFICATION_CONFIDENCE, MAX_DIGIT_COUNT, MIN_DIGIT_COUNT } from '../constants';
import type {
  ChargeKind,
  ShootingInputType,
  SlotId,
  WeaponSlotCalibration,
} from '../types';
import type { SlotClassification } from './slotClassifier';
import styles from './SlotInspector.module.css';
import type { DrawTarget } from './useCalibrationDraw';

/** 画面から判定しうる入力種別。格闘は自動検出の対象外なので並べない */
const INPUT_TYPE_OPTIONS: readonly { value: ShootingInputType; label: string }[] = [
  { value: 'shot', label: '射撃' },
  { value: 'sub', label: 'サブ' },
  { value: 'special-shot', label: '特射' },
  { value: 'special-melee', label: '特格' },
];

const CHARGE_KIND_OPTIONS: readonly { value: ChargeKind; label: string }[] = [
  { value: 'shot', label: '射撃チャージ' },
  { value: 'melee', label: '格闘チャージ' },
];

export type SlotInspectorProps = {
  readonly slots: readonly WeaponSlotCalibration[];
  readonly classifications: Readonly<Record<SlotId, SlotClassification | null>>;
  onUpdateSlot(slotId: SlotId, patch: Partial<WeaponSlotCalibration>): void;
  onRemoveSlot(slotId: SlotId): void;
  onSelectTarget(target: DrawTarget): void;
};

function isUncertain(classification: SlotClassification | null | undefined): boolean {
  // 未推定（undefined / null）も「確かめてほしい」側に寄せる
  return classification == null || classification.confidence < LOW_CLASSIFICATION_CONFIDENCE;
}

export function SlotInspector({
  slots,
  classifications,
  onUpdateSlot,
  onRemoveSlot,
  onSelectTarget,
}: SlotInspectorProps) {
  if (slots.length === 0) {
    return (
      <p className={styles.empty} data-testid="slot-empty">
        動画の上で弾数表示をドラッグすると武器スロットが増えます
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {slots.map((slot) => {
        const number = slot.index + 1;
        const classification = classifications[slot.id];
        const uncertain = isUncertain(classification);

        return (
          <li key={slot.id} className={styles.row} data-testid={`slot-row-${slot.id}`}>
            <div className={styles.head}>
              <span className={styles.number}>スロット {number}</span>
              <span className={styles.proposal}>
                {classification == null
                  ? '推定できませんでした'
                  : `推定 ${classification.confidence.toFixed(2)}`}
              </span>
              {uncertain && (
                <span
                  className={styles.warning}
                  data-testid={`slot-low-confidence-${slot.id}`}
                  title="推定の確からしさが低いスロットです。種別を確認してください"
                >
                  要確認
                </span>
              )}
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemoveSlot(slot.id)}
                aria-label={`スロット ${number} を削除`}
              >
                ✕
              </button>
            </div>

            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>入力種別</span>
                <select
                  className={styles.input}
                  aria-label={`スロット ${number} の入力種別`}
                  value={slot.inputType}
                  onChange={(event) =>
                    onUpdateSlot(slot.id, {
                      inputType: event.target.value as ShootingInputType,
                      // 手で選んだ値を次の推定で上書きしないための印
                      inputTypeSource: 'manual',
                    })
                  }
                >
                  {INPUT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>桁数</span>
                <input
                  className={styles.input}
                  type="number"
                  aria-label={`スロット ${number} の桁数`}
                  min={MIN_DIGIT_COUNT}
                  max={MAX_DIGIT_COUNT}
                  step={1}
                  value={slot.digitCount}
                  onChange={(event) =>
                    onUpdateSlot(slot.id, { digitCount: Number(event.target.value) })
                  }
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>CHARGE 種別</span>
                <select
                  className={styles.input}
                  aria-label={`スロット ${number} の CHARGE 種別`}
                  value={slot.chargeKind ?? ''}
                  onChange={(event) =>
                    onUpdateSlot(slot.id, {
                      chargeKind:
                        event.target.value === ''
                          ? null
                          : (event.target.value as ChargeKind),
                    })
                  }
                >
                  <option value="">なし</option>
                  {CHARGE_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.action}
                onClick={() => onSelectTarget({ kind: 'slot_indicator', slotId: slot.id })}
                aria-label={`スロット ${number} のボタン表示領域を描く`}
              >
                ボタン表示領域{slot.buttonIndicatorRect === null ? '' : ' ✓'}
              </button>
              <button
                type="button"
                className={styles.action}
                onClick={() => onSelectTarget({ kind: 'slot_charge', slotId: slot.id })}
                aria-label={`スロット ${number} の CHARGE 領域を描く`}
              >
                CHARGE 領域{slot.chargeRect === null ? '' : ' ✓'}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
