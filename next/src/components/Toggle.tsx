'use client';

import styles from './Toggle.module.css';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** ラベルの下に出す補足 */
  description?: string;
  disabled?: boolean;
}

/**
 * 設定の ON / OFF を切り替える 2 択スイッチ。
 * 中身は本物のチェックボックスなので、キーボードと読み上げでも操作できる。状態は色だけでなく ON / OFF の文字でも出す。
 */
export function Toggle({ label, checked, onChange, description, disabled = false }: ToggleProps) {
  return (
    <label className={styles.field} data-disabled={disabled}>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      <span className={styles.control}>
        <input
          type="checkbox"
          role="switch"
          className={styles.input}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={styles.track} aria-hidden="true" />
        <span className={styles.state} aria-hidden="true">
          {checked ? 'ON' : 'OFF'}
        </span>
      </span>
    </label>
  );
}
