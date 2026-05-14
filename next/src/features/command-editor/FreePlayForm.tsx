'use client';

import { useEffect, useRef, useState } from 'react';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType, CommandStep } from '@/types';
import styles from './FreePlayForm.module.css';

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

export function FreePlayForm() {
  const [sequence, setSequence] = useState<CommandStep[]>([]);
  const sequencePreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sequencePreviewRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [sequence]);

  const handleStepAdded = (step: CommandStep) => {
    setSequence((prev) => [...prev, step]);
  };

  const handleReset = () => setSequence([]);

  return (
    <div className={styles.form}>
      <header className={styles.header}>
        <h1 className={styles.title}>EXVS2 コマンド練習アプリ</h1>
      </header>
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
      <div className={styles.controllerArea}>
        <ArcadeController onStepAdded={handleStepAdded} />
      </div>
    </div>
  );
}
