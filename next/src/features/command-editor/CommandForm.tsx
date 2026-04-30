'use client';

import { useState } from 'react';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import type { Command, CommandStep, StorageResult } from '@/types';

const BUTTON_LABELS: Record<string, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャンプ',
  awaken: '覚醒',
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

  const isValid = mobileSuit.trim() !== '' && name.trim() !== '' && sequence.length > 0;

  const handleStepAdded = (step: CommandStep) => {
    setSequence((prev) => [...prev, step]);
  };

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
    <div>
      <div>
        <label htmlFor="mobile-suit">機体名</label>
        <input
          id="mobile-suit"
          type="text"
          value={mobileSuit}
          onChange={(e) => setMobileSuit(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="command-name">コマンド名</label>
        <input
          id="command-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <ArcadeController onStepAdded={handleStepAdded} />
      <div data-testid="sequence-preview">
        {sequence.map((step, i) => (
          <span key={i} data-testid="sequence-step">
            {step.buttons.map((b) => BUTTON_LABELS[b] ?? b).join('+')}
          </span>
        ))}
      </div>
      {errorMessage && <div role="alert">{errorMessage}</div>}
      <button type="button" disabled={!isValid} onClick={handleSubmit}>
        保存
      </button>
    </div>
  );
}
