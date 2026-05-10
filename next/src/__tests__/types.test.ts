import { describe, it, expect } from 'vitest';
import type {
  ButtonType,
  CommandStep,
  Command,
  PracticeAttempt,
  PracticeLog,
  PracticeSessionStatus,
  PracticeSessionState,
  StorageError,
  StorageResult,
} from '@/types';
import { isButtonType } from '@/types';

describe('ButtonType', () => {
  it('11種類のボタン値を受け付ける', () => {
    const buttons: ButtonType[] = [
      'shot', 'melee', 'jump', 'awaken',
      'shot-charge-start', 'shot-charge-end',
      'melee-charge-start', 'melee-charge-end',
      'sub', 'special-shot', 'special-melee',
    ];
    expect(buttons).toHaveLength(11);
  });
});

describe('isButtonType', () => {
  it('既存4種に対して true を返す', () => {
    expect(isButtonType('shot')).toBe(true);
    expect(isButtonType('melee')).toBe(true);
    expect(isButtonType('jump')).toBe(true);
    expect(isButtonType('awaken')).toBe(true);
  });

  it('新規7種に対して true を返す', () => {
    expect(isButtonType('shot-charge-start')).toBe(true);
    expect(isButtonType('shot-charge-end')).toBe(true);
    expect(isButtonType('melee-charge-start')).toBe(true);
    expect(isButtonType('melee-charge-end')).toBe(true);
    expect(isButtonType('sub')).toBe(true);
    expect(isButtonType('special-shot')).toBe(true);
    expect(isButtonType('special-melee')).toBe(true);
  });

  it('旧チャージ型（shot-charge, melee-charge）に対して false を返す', () => {
    expect(isButtonType('shot-charge')).toBe(false);
    expect(isButtonType('melee-charge')).toBe(false);
  });

  it('不正な文字列に対して false を返す', () => {
    expect(isButtonType('')).toBe(false);
    expect(isButtonType('unknown-type')).toBe(false);
    expect(isButtonType('Shot')).toBe(false);
  });

  it('非文字列値に対して false を返す', () => {
    expect(isButtonType(null)).toBe(false);
    expect(isButtonType(undefined)).toBe(false);
    expect(isButtonType(42)).toBe(false);
    expect(isButtonType({})).toBe(false);
  });
});

describe('CommandStep', () => {
  it('単押しを表現できる', () => {
    const step: CommandStep = { buttons: ['shot'] };
    expect(step.buttons).toHaveLength(1);
  });

  it('同時押しを表現できる', () => {
    const step: CommandStep = { buttons: ['jump', 'shot'] };
    expect(step.buttons).toHaveLength(2);
  });
});

describe('Command', () => {
  it('必要なフィールドを全て持つ', () => {
    const command: Command = {
      id: 'uuid-v4',
      mobileSuit: 'ガンダム',
      name: 'ズンダ',
      sequence: [{ buttons: ['jump'] }, { buttons: ['jump'] }, { buttons: ['shot'] }],
      createdAt: new Date().toISOString(),
    };
    expect(command.sequence).toHaveLength(3);
    expect(command.mobileSuit).toBe('ガンダム');
  });
});

describe('PracticeAttempt', () => {
  it('成功試行を表現できる', () => {
    const attempt: PracticeAttempt = { success: true, timestamp: new Date().toISOString() };
    expect(attempt.success).toBe(true);
  });

  it('失敗試行を表現できる', () => {
    const attempt: PracticeAttempt = { success: false, timestamp: new Date().toISOString() };
    expect(attempt.success).toBe(false);
  });
});

describe('PracticeLog', () => {
  it('コマンドIDと試行履歴を持つ', () => {
    const log: PracticeLog = {
      commandId: 'cmd-1',
      attempts: [
        { success: true, timestamp: '2026-01-01T00:00:00.000Z' },
        { success: false, timestamp: '2026-01-01T00:00:01.000Z' },
      ],
    };
    expect(log.attempts).toHaveLength(2);
  });
});

describe('PracticeSessionStatus', () => {
  it('3つのステータス値を受け付ける', () => {
    const statuses: PracticeSessionStatus[] = ['idle', 'active', 'completed'];
    expect(statuses).toHaveLength(3);
  });
});

describe('PracticeSessionState', () => {
  it('idle 初期状態を表現できる', () => {
    const state: PracticeSessionState = {
      status: 'idle',
      command: null,
      currentIndex: 0,
      attempts: [],
      lastResult: null,
    };
    expect(state.status).toBe('idle');
    expect(state.command).toBeNull();
  });

  it('active 状態でコマンドを持てる', () => {
    const command: Command = {
      id: 'cmd-1',
      mobileSuit: 'ガンダム',
      name: 'ズンダ',
      sequence: [{ buttons: ['jump'] }],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const state: PracticeSessionState = {
      status: 'active',
      command,
      currentIndex: 0,
      attempts: [],
      lastResult: null,
    };
    expect(state.command?.name).toBe('ズンダ');
  });
});

describe('StorageError', () => {
  it('3種類のエラー型を受け付ける', () => {
    const errors: StorageError[] = [
      { type: 'quota_exceeded', message: 'ストレージ容量超過' },
      { type: 'parse_error', message: 'JSON解析失敗' },
      { type: 'write_error', message: '書き込みエラー' },
    ];
    expect(errors).toHaveLength(3);
  });
});

describe('StorageResult<T>', () => {
  it('成功結果を判別型で表現できる', () => {
    const result: StorageResult<string> = { ok: true, value: 'test' };
    if (result.ok) {
      expect(result.value).toBe('test');
    }
  });

  it('失敗結果を判別型で表現できる', () => {
    const result: StorageResult<string> = {
      ok: false,
      error: { type: 'write_error', message: '書き込み失敗' },
    };
    if (!result.ok) {
      expect(result.error.type).toBe('write_error');
    }
  });
});
