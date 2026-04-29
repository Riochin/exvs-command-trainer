import { describe, it, expect } from 'vitest';
import type { ButtonType, CommandStep, StorageResult } from '@/types';

describe('@/ パスエイリアス', () => {
  it('ButtonType が @/types からインポートできる', () => {
    const btn: ButtonType = 'shot';
    expect(btn).toBe('shot');
  });

  it('CommandStep が @/types からインポートできる', () => {
    const step: CommandStep = { buttons: ['shot', 'melee'] };
    expect(step.buttons).toHaveLength(2);
  });

  it('StorageResult が @/types からインポートできる', () => {
    const result: StorageResult<string> = { ok: true, value: 'test' };
    expect(result.ok).toBe(true);
  });
});
