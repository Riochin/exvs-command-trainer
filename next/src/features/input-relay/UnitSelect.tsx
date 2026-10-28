'use client';

/**
 * 機体選択（キャラセレクト）。機体のカードを並べ、選ぶと練習する機体を切り替える。
 */
import { useEffect } from 'react';
import { UNITS, type UnitDef } from './sim/units';
import styles from './UnitSelect.module.css';

export type UnitSelectProps = {
  currentId: string;
  onSelect: (unitId: string) => void;
  onClose: () => void;
};

function Swatch({ unit }: { unit: UnitDef }) {
  const { frame, chest, accent, trim } = unit.look;
  return (
    <span className={styles.swatch} aria-hidden="true">
      {[frame, chest, accent, trim].map((color, i) => (
        <span key={i} style={{ background: color }} />
      ))}
    </span>
  );
}

export function UnitSelect({ currentId, onSelect, onClose }: UnitSelectProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unit-select-title"
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="unit-select-title" className={styles.title}>
          MOBILE SUIT SELECT
        </h2>
        <ul className={styles.grid}>
          {UNITS.map((unit) => (
            <li key={unit.id}>
              <button
                type="button"
                className={styles.card}
                data-current={unit.id === currentId}
                onClick={() => onSelect(unit.id)}
              >
                <span className={styles.cost}>{unit.cost}</span>
                <Swatch unit={unit} />
                <span className={styles.name}>{unit.name}</span>
                <span className={styles.meta}>
                  {unit.series} ／ {unit.pilot}
                </span>
                <span className={styles.description}>{unit.description}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.close} onClick={onClose}>
          閉じる（Esc）
        </button>
      </div>
    </div>
  );
}

/** 選んでいる機体の技表 */
export function CommandList({ unit }: { unit: UnitDef }) {
  return (
    <dl className={styles.commands}>
      {unit.commands.map((row) => (
        <div key={row.input + row.name} className={styles.commandRow}>
          <dt>{row.input}</dt>
          <dd>
            {row.name}
            {row.note && <span className={styles.note}>{row.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
