import { useCallback, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { PracticeAttempt, PracticeLog, StorageError, StorageResult } from '@/types';

const LOGS_KEY = 'ct_practice_logs';

export interface UsePracticeLogReturn {
  getLog(commandId: string): PracticeLog | null;
  recordAttempt(commandId: string, attempt: PracticeAttempt): StorageResult<void>;
  clearLog(commandId: string): void;
  isLoading: boolean;
  lastError: StorageError | null;
}

export function usePracticeLog(): UsePracticeLogReturn {
  const { value: logs, setValue, isLoading } = useLocalStorage<Record<string, PracticeLog>>(LOGS_KEY, {});
  const [lastError, setLastError] = useState<StorageError | null>(null);

  // setValue は localStorage を即時書き込むため、次の同期呼び出しで最新値を読める
  const readCurrentLogs = useCallback((): Record<string, PracticeLog> => {
    try {
      const raw = localStorage.getItem(LOGS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, PracticeLog>) : {};
    } catch {
      return logs;
    }
  }, [logs]);

  const getLog = useCallback(
    (commandId: string): PracticeLog | null => {
      const current = readCurrentLogs();
      return current[commandId] ?? null;
    },
    [readCurrentLogs],
  );

  const recordAttempt = useCallback(
    (commandId: string, attempt: PracticeAttempt): StorageResult<void> => {
      const current = readCurrentLogs();
      const existing = current[commandId];
      const updated: PracticeLog = existing
        ? { ...existing, attempts: [...existing.attempts, attempt] }
        : { commandId, attempts: [attempt] };

      const result = setValue({ ...current, [commandId]: updated });
      if (!result.ok) {
        setLastError(result.error);
        return result;
      }
      setLastError(null);
      return { ok: true, value: undefined };
    },
    [setValue, readCurrentLogs],
  );

  const clearLog = useCallback(
    (commandId: string): void => {
      const current = readCurrentLogs();
      if (!current[commandId]) return;
      const { [commandId]: _, ...rest } = current;
      setValue(rest);
    },
    [setValue, readCurrentLogs],
  );

  return { getLog, recordAttempt, clearLog, isLoading, lastError };
}
