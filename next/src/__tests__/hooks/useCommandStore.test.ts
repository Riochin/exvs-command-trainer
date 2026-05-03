import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCommandStore } from '@/hooks/useCommandStore';
import type { CommandStep } from '@/types';

const STORAGE_KEY = 'ct_commands';
const LOG_KEY = 'ct_practice_logs';

const validInput = {
  mobileSuit: 'ストライクフリーダム',
  name: 'ズンダ',
  sequence: [{ buttons: ['jump'] }, { buttons: ['jump'] }, { buttons: ['shot'] }] as CommandStep[],
};

describe('useCommandStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('初期状態', () => {
    it('commands が空配列として返る', () => {
      const { result } = renderHook(() => useCommandStore());
      expect(result.current.commands).toEqual([]);
    });

    it('isLoading が false として返る', () => {
      const { result } = renderHook(() => useCommandStore());
      expect(result.current.isLoading).toBe(false);
    });

    it('lastError が null として返る', () => {
      const { result } = renderHook(() => useCommandStore());
      expect(result.current.lastError).toBeNull();
    });

    it('localStorage に保存済みコマンドがある場合それを読み込む', () => {
      const stored = [
        { id: 'abc', mobileSuit: 'νガンダム', name: 'test', sequence: [{ buttons: ['shot'] }], createdAt: '2026-01-01T00:00:00.000Z' },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      const { result } = renderHook(() => useCommandStore());
      expect(result.current.commands).toHaveLength(1);
      expect(result.current.commands[0].mobileSuit).toBe('νガンダム');
    });
  });

  describe('addCommand', () => {
    it('コマンドを追加して StorageResult ok: true を返す', () => {
      const { result } = renderHook(() => useCommandStore());
      let res!: ReturnType<typeof result.current.addCommand>;
      act(() => {
        res = result.current.addCommand(validInput);
      });
      expect(res.ok).toBe(true);
    });

    it('追加後 commands に新コマンドが含まれる', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
      });
      expect(result.current.commands).toHaveLength(1);
      expect(result.current.commands[0].name).toBe('ズンダ');
    });

    it('UUID v4 形式の id が自動付与される', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
      });
      const id = result.current.commands[0].id;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('ISO 8601 形式の createdAt が自動付与される', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
      });
      const createdAt = result.current.commands[0].createdAt;
      expect(new Date(createdAt).toISOString()).toBe(createdAt);
    });

    it('localStorage の ct_commands キーに永続化される', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('ズンダ');
    });

    it('mobileSuit が空の場合 ok: false を返す', () => {
      const { result } = renderHook(() => useCommandStore());
      let res!: ReturnType<typeof result.current.addCommand>;
      act(() => {
        res = result.current.addCommand({ ...validInput, mobileSuit: '' });
      });
      expect(res.ok).toBe(false);
    });

    it('name が空の場合 ok: false を返す', () => {
      const { result } = renderHook(() => useCommandStore());
      let res!: ReturnType<typeof result.current.addCommand>;
      act(() => {
        res = result.current.addCommand({ ...validInput, name: '' });
      });
      expect(res.ok).toBe(false);
    });

    it('sequence が空配列の場合 ok: false を返す', () => {
      const { result } = renderHook(() => useCommandStore());
      let res!: ReturnType<typeof result.current.addCommand>;
      act(() => {
        res = result.current.addCommand({ ...validInput, sequence: [] });
      });
      expect(res.ok).toBe(false);
    });

    it('バリデーション失敗時 commands は変更されない', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand({ ...validInput, mobileSuit: '' });
      });
      expect(result.current.commands).toHaveLength(0);
    });

    it('複数コマンドを追加できる', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
        result.current.addCommand({ ...validInput, name: '格闘コンボ' });
      });
      expect(result.current.commands).toHaveLength(2);
    });
  });

  describe('removeCommand', () => {
    it('id を指定してコマンドを削除し ok: true を返す', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
      });
      const id = result.current.commands[0].id;
      let res!: ReturnType<typeof result.current.removeCommand>;
      act(() => {
        res = result.current.removeCommand(id);
      });
      expect(res.ok).toBe(true);
      expect(result.current.commands).toHaveLength(0);
    });

    it('存在しない id を指定した場合 ok: false を返す', () => {
      const { result } = renderHook(() => useCommandStore());
      let res!: ReturnType<typeof result.current.removeCommand>;
      act(() => {
        res = result.current.removeCommand('nonexistent-id');
      });
      expect(res.ok).toBe(false);
    });

    it('削除後 localStorage の ct_commands から除去される', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
      });
      const id = result.current.commands[0].id;
      act(() => {
        result.current.removeCommand(id);
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      expect(stored).toHaveLength(0);
    });

    it('コマンド削除時に ct_practice_logs から対応ログも削除される', () => {
      const logs = { 'cmd-1': { commandId: 'cmd-1', attempts: [{ success: true, timestamp: '2026-01-01T00:00:00.000Z' }] }, 'cmd-2': { commandId: 'cmd-2', attempts: [] } };
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));

      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
      });
      const id = result.current.commands[0].id;
      // 追加したコマンドのログを模擬
      const currentLogs = JSON.parse(localStorage.getItem(LOG_KEY) ?? '{}') as Record<string, unknown>;
      currentLogs[id] = { commandId: id, attempts: [] };
      localStorage.setItem(LOG_KEY, JSON.stringify(currentLogs));

      act(() => {
        result.current.removeCommand(id);
      });

      const remainingLogs = JSON.parse(localStorage.getItem(LOG_KEY) ?? '{}') as Record<string, unknown>;
      expect(remainingLogs[id]).toBeUndefined();
      // 他コマンドのログは残る
      expect(remainingLogs['cmd-1']).toBeDefined();
    });
  });

  describe('getCommand', () => {
    it('存在する id を指定するとコマンドを返す', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
      });
      const id = result.current.commands[0].id;
      expect(result.current.getCommand(id)).toBeDefined();
      expect(result.current.getCommand(id)?.name).toBe('ズンダ');
    });

    it('存在しない id を指定すると undefined を返す', () => {
      const { result } = renderHook(() => useCommandStore());
      expect(result.current.getCommand('no-such-id')).toBeUndefined();
    });
  });

  describe('getCommandsByMobileSuit', () => {
    it('機体名でコマンドをフィルタできる', () => {
      const { result } = renderHook(() => useCommandStore());
      act(() => {
        result.current.addCommand(validInput);
        result.current.addCommand({ ...validInput, mobileSuit: 'νガンダム', name: 'ファンネル' });
      });
      const strike = result.current.getCommandsByMobileSuit('ストライクフリーダム');
      expect(strike).toHaveLength(1);
      expect(strike[0].name).toBe('ズンダ');
    });

    it('該当機体がない場合は空配列を返す', () => {
      const { result } = renderHook(() => useCommandStore());
      expect(result.current.getCommandsByMobileSuit('存在しない機体')).toEqual([]);
    });
  });

  describe('ButtonType バリデーション（ストレージ読み込み時）', () => {
    it('不正な ButtonType を含むコマンドを読み込むと lastError が parse_error になる', async () => {
      const invalidData = [
        {
          id: 'abc',
          mobileSuit: 'ガンダム',
          name: 'テスト',
          sequence: [{ buttons: ['unknown-type'] }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(invalidData));

      const { result } = renderHook(() => useCommandStore());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.lastError).not.toBeNull();
      expect(result.current.lastError?.type).toBe('parse_error');
    });

    it('正常な ButtonType のみのコマンドでは lastError が設定されない', async () => {
      const validData = [
        {
          id: 'abc',
          mobileSuit: 'ガンダム',
          name: 'テスト',
          sequence: [{ buttons: ['melee-charge'] }, { buttons: ['sub'] }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validData));

      const { result } = renderHook(() => useCommandStore());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.lastError).toBeNull();
    });
  });
});
