'use client';

import { useEffect, useRef, useState } from 'react';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import { CapsuleButton } from '@/components/CapsuleButton';
import type { ButtonType, Command, CommandStep, StorageResult } from '@/types';
import styles from './CommandForm.module.css';

const BUTTON_LABELS: Record<ButtonType, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャ\nンプ',
  bd: 'BD',
  awaken: '覚醒',
  'shot-charge-start': '射CS\n開始',
  'shot-charge-end': '射CS\n終わり',
  'melee-charge-start': '格CS\n開始',
  'melee-charge-end': '格CS\n終わり',
  sub: 'サブ',
  'special-shot': '特射',
  'special-melee': '特格',
};

type PreviewItem =
  | { kind: 'step'; index: number }
  | { kind: 'pair'; startIndex: number; label: string };

function buildPreviewItems(sequence: CommandStep[]): PreviewItem[] {
  const items: PreviewItem[] = [];
  let i = 0;
  while (i < sequence.length) {
    const btn = sequence[i].buttons[0];
    if (btn === 'shot-charge-start' && sequence[i + 1]?.buttons[0] === 'shot-charge-end') {
      items.push({ kind: 'pair', startIndex: i, label: '射CS' });
      i += 2;
    } else if (btn === 'melee-charge-start' && sequence[i + 1]?.buttons[0] === 'melee-charge-end') {
      items.push({ kind: 'pair', startIndex: i, label: '格CS' });
      i += 2;
    } else {
      items.push({ kind: 'step', index: i });
      i += 1;
    }
  }
  return items;
}

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

  const MAX_SEQUENCE = 20;
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
          {buildPreviewItems(sequence).map((item, i) =>
            item.kind === 'pair' ? (
              <span key={i} data-testid="sequence-step" className={styles.previewStep}>
                {item.label}
              </span>
            ) : (
              <span key={i} data-testid="sequence-step" className={styles.previewStep}>
                {sequence[item.index].buttons.map((b) => BUTTON_LABELS[b]).join('+')}
              </span>
            ),
          )}
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
