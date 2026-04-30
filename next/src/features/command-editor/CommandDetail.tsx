'use client';

import type { Command } from '@/types';

const BUTTON_LABELS: Record<string, string> = {
  shot: '射撃',
  melee: '格闘',
  jump: 'ジャンプ',
  awaken: '覚醒',
};

export interface CommandDetailProps {
  command: Command | null | undefined;
}

export function CommandDetail({ command }: CommandDetailProps) {
  if (!command) {
    return <p>コマンドが見つかりません</p>;
  }

  return (
    <div>
      <h1>{command.name}</h1>
      <p>{command.mobileSuit}</p>
      <ol>
        {command.sequence.map((step, i) => (
          <li key={i} data-testid="detail-step">
            {step.buttons.map((b) => BUTTON_LABELS[b] ?? b).join('+')}
          </li>
        ))}
      </ol>
    </div>
  );
}
