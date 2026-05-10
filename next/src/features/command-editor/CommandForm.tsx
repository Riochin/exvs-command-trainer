'use client';

import { useEffect, useRef, useState } from 'react';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import { CapsuleButton } from '@/components/CapsuleButton';
import type { ButtonType, Command, CommandStep, StorageResult } from '@/types';
import styles from './CommandForm.module.css';

const BUTTON_LABELS: Record<ButtonType, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャンプ',
  awaken: '覚醒',
  'shot-charge': '射撃チャージ',
  'melee-charge': '格闘チャージ',
  sub: 'サブ',
  'special-shot': '特射',
  'special-melee': '特格',
};

export interface CommandFormProps {
  onAdd: (input: Omit<Command, 'id' | 'createdAt'>) => StorageResult<Command>;
  onSuccess: () => void;
}

export function CommandForm({ onAdd, onSuccess }: CommandFormProps) {
  const [mobileSuit, setMobileSuit] = useState('');
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState<CommandStep[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sequencePreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sequencePreviewRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [sequence]);

  const MAX_SEQUENCE = 10;
  const isAtMax = sequence.length >= MAX_SEQUENCE;
  const isValid = mobileSuit.trim() !== '' && name.trim() !== '' && sequence.length > 0;

  const handleStepAdded = (step: CommandStep) => {
    setSequence((prev) => (prev.length < MAX_SEQUENCE ? [...prev, step] : prev));
  };

  const handleReset = () => setSequence([]);

  const handleSubmit = () => {
    const result = onAdd({ mobileSuit: mobileSuit.trim(), name: name.trim(), sequence });
    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }
    setErrorMessage(null);
    onSuccess();
  };

  return (
    <div className={styles.form}>
      <div className={styles.header}>
        <div className={styles.fieldGroup}>
          <label htmlFor="mobile-suit" className={styles.label}>機体名</label>
          <input
            id="mobile-suit"
            type="text"
            value={mobileSuit}
            onChange={(e) => setMobileSuit(e.target.value)}
            className={styles.inputField}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="command-name" className={styles.label}>コマンド名</label>
          <input
            id="command-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.inputField}
          />
        </div>
        <div className={styles.saveButtonWrapper}>
          <CapsuleButton disabled={!isValid} onClick={handleSubmit}>
            保存
          </CapsuleButton>
        </div>
      </div>
      <div className={styles.sequenceRow}>
        <div ref={sequencePreviewRef} data-testid="sequence-preview" className={styles.sequencePreview}>
          {sequence.map((step, i) => (
            <span key={i} data-testid="sequence-step" className={styles.previewStep}>
              {step.buttons.map((b) => BUTTON_LABELS[b]).join('+')}
            </span>
          ))}
          {isAtMax && <span className={styles.maxLabel}>MAX</span>}
        </div>
        <button
          type="button"
          onClick={handleReset}
          className={styles.resetButton}
          style={sequence.length === 0 ? { visibility: 'hidden' } : undefined}
        >
          RESET
        </button>
      </div>
      {errorMessage && <div role="alert" className={styles.errorAlert}>{errorMessage}</div>}
      <div className={styles.controllerArea}>
        <ArcadeController onStepAdded={handleStepAdded} />
      </div>
    </div>
  );
}
