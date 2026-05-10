import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { isButtonType } from '@/types';
import type { Command, StorageError, StorageResult } from '@/types';

const COMMANDS_KEY = 'ct_commands';
const LOGS_KEY = 'ct_practice_logs';

function migrateOldChargeTypes(commands: Command[]): Command[] {
  return commands.map((cmd) => ({
    ...cmd,
    sequence: cmd.sequence.flatMap((step) => {
      const buttons = step.buttons as unknown as string[];
      if (buttons.includes('shot-charge')) {
        return [
          { buttons: ['shot-charge-start'] as Command['sequence'][number]['buttons'] },
          { buttons: ['shot-charge-end'] as Command['sequence'][number]['buttons'] },
        ];
      }
      if (buttons.includes('melee-charge')) {
        return [
          { buttons: ['melee-charge-start'] as Command['sequence'][number]['buttons'] },
          { buttons: ['melee-charge-end'] as Command['sequence'][number]['buttons'] },
        ];
      }
      return [step];
    }),
  }));
}

export interface UseCommandStoreReturn {
  commands: Command[];
  isLoading: boolean;
  lastError: StorageError | null;
  addCommand(input: Omit<Command, 'id' | 'createdAt'>): StorageResult<Command>;
  removeCommand(id: string): StorageResult<void>;
  getCommand(id: string): Command | undefined;
  getCommandsByMobileSuit(mobileSuit: string): Command[];
}

export function useCommandStore(): UseCommandStoreReturn {
  const { value: commands, setValue, isLoading } = useLocalStorage<Command[]>(COMMANDS_KEY, []);
  const [lastError, setLastError] = useState<StorageError | null>(null);

  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    if (isLoading) return;

    const needsMigration = commands.some((cmd) =>
      cmd.sequence.some((step) =>
        (step.buttons as unknown as string[]).some((b) => b === 'shot-charge' || b === 'melee-charge'),
      ),
    );
    if (needsMigration) {
      setValue(migrateOldChargeTypes(commands));
      return;
    }

    const hasInvalidButtonType = commands.some((cmd) =>
      cmd.sequence.some((step) => step.buttons.some((b) => !isButtonType(b))),
    );
    if (hasInvalidButtonType) {
      setLastError({ type: 'parse_error', message: '不正な ButtonType が保存データに含まれています' });
    }
  }, [commands, isLoading, setValue]);

  // setValue は localStorage を即時書き込むため、次の同期呼び出しで最新値を読める
  const readCurrentCommands = useCallback((): Command[] => {
    try {
      const raw = localStorage.getItem(COMMANDS_KEY);
      return raw ? (JSON.parse(raw) as Command[]) : [];
    } catch {
      return commandsRef.current;
    }
  }, []);

  const addCommand = useCallback(
    (input: Omit<Command, 'id' | 'createdAt'>): StorageResult<Command> => {
      if (!input.mobileSuit.trim()) {
        const error: StorageError = { type: 'write_error', message: '機体名は必須です' };
        setLastError(error);
        return { ok: false, error };
      }
      if (!input.name.trim()) {
        const error: StorageError = { type: 'write_error', message: 'コマンド名は必須です' };
        setLastError(error);
        return { ok: false, error };
      }
      if (input.sequence.length === 0) {
        const error: StorageError = { type: 'write_error', message: 'シーケンスは1ステップ以上必要です' };
        setLastError(error);
        return { ok: false, error };
      }
      if (input.sequence.length > 10) {
        const error: StorageError = { type: 'write_error', message: 'シーケンスは最大10ステップです' };
        setLastError(error);
        return { ok: false, error };
      }

      const newCommand: Command = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      const current = readCurrentCommands();
      const result = setValue([...current, newCommand]);
      if (!result.ok) {
        setLastError(result.error);
        return result;
      }
      setLastError(null);
      return { ok: true, value: newCommand };
    },
    [setValue, readCurrentCommands],
  );

  const removeCommand = useCallback(
    (id: string): StorageResult<void> => {
      const current = readCurrentCommands();
      const exists = current.find((c) => c.id === id);
      if (!exists) {
        const error: StorageError = { type: 'write_error', message: `コマンド ID ${id} が見つかりません` };
        setLastError(error);
        return { ok: false, error };
      }

      const result = setValue(current.filter((c) => c.id !== id));
      if (!result.ok) {
        setLastError(result.error);
        return result;
      }

      // 対応する練習ログを削除（孤立データ防止）
      try {
        const raw = localStorage.getItem(LOGS_KEY);
        if (raw !== null) {
          const logs = JSON.parse(raw) as Record<string, unknown>;
          delete logs[id];
          localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
        }
      } catch {
        // ログ削除失敗はサイレントに無視（コマンド削除は成功扱い）
      }

      setLastError(null);
      return { ok: true, value: undefined };
    },
    [setValue, readCurrentCommands],
  );

  const getCommand = useCallback(
    (id: string): Command | undefined => commands.find((c) => c.id === id),
    [commands],
  );

  const getCommandsByMobileSuit = useCallback(
    (mobileSuit: string): Command[] => commands.filter((c) => c.mobileSuit === mobileSuit),
    [commands],
  );

  return { commands, isLoading, lastError, addCommand, removeCommand, getCommand, getCommandsByMobileSuit };
}
