import { useState, useEffect, useCallback } from 'react';
import type { StorageError, StorageResult } from '@/types';

export interface UseLocalStorageReturn<T> {
  value: T;
  setValue(newValue: T): StorageResult<T>;
  removeValue(): void;
  isLoading: boolean;
}

export function useLocalStorage<T>(key: string, defaultValue: T): UseLocalStorageReturn<T> {
  const [value, setValueState] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setValueState(JSON.parse(item) as T);
      }
    } catch {
      // localStorage 未利用または JSON 破損 — defaultValue のまま
    }
    setIsLoading(false);
  }, [key]);

  const setValue = useCallback(
    (newValue: T): StorageResult<T> => {
      try {
        window.localStorage.setItem(key, JSON.stringify(newValue));
        setValueState(newValue);
        return { ok: true, value: newValue };
      } catch (err) {
        const error: StorageError =
          err instanceof DOMException && err.name === 'QuotaExceededError'
            ? { type: 'quota_exceeded', message: err.message }
            : { type: 'write_error', message: err instanceof Error ? err.message : 'Unknown error' };
        return { ok: false, error };
      }
    },
    [key],
  );

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setValueState(defaultValue);
    } catch {
      // ignore
    }
  }, [key, defaultValue]);

  return { value, setValue, removeValue, isLoading };
}
