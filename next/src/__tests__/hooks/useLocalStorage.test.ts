import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLocalStorage } from '@/hooks/useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('localStorage にデータがない場合 defaultValue を返す', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current.value).toBe('default');
  });

  it('マウント後 isLoading が false になる', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current.isLoading).toBe(false);
  });

  it('localStorage に保存済みのデータがある場合その値を返す', () => {
    localStorage.setItem('test-key', JSON.stringify('stored'));
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current.value).toBe('stored');
  });

  it('オブジェクト型を型安全に読み書きできる', () => {
    const initial = { count: 0 };
    localStorage.setItem('obj-key', JSON.stringify({ count: 42 }));
    const { result } = renderHook(() => useLocalStorage('obj-key', initial));
    expect(result.current.value).toEqual({ count: 42 });
  });

  it('配列型を型安全に扱える', () => {
    const { result } = renderHook(() => useLocalStorage<string[]>('arr-key', []));
    act(() => {
      result.current.setValue(['a', 'b', 'c']);
    });
    expect(result.current.value).toEqual(['a', 'b', 'c']);
  });

  describe('setValue', () => {
    it('値を更新し localStorage に保存する', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
      act(() => {
        result.current.setValue('new-value');
      });
      expect(result.current.value).toBe('new-value');
      expect(JSON.parse(localStorage.getItem('test-key') ?? '')).toBe('new-value');
    });

    it('成功時に StorageResult ok: true を返す', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
      let storageResult!: ReturnType<typeof result.current.setValue>;
      act(() => {
        storageResult = result.current.setValue('new-value');
      });
      expect(storageResult.ok).toBe(true);
      if (storageResult.ok) {
        expect(storageResult.value).toBe('new-value');
      }
    });

    it('QuotaExceededError 時に StorageResult ok: false、type: quota_exceeded を返す', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      });
      let storageResult!: ReturnType<typeof result.current.setValue>;
      act(() => {
        storageResult = result.current.setValue('new-value');
      });
      expect(storageResult.ok).toBe(false);
      if (!storageResult.ok) {
        expect(storageResult.error.type).toBe('quota_exceeded');
      }
    });

    it('その他の書き込みエラー時に StorageResult ok: false、type: write_error を返す', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('unknown write error');
      });
      let storageResult!: ReturnType<typeof result.current.setValue>;
      act(() => {
        storageResult = result.current.setValue('new-value');
      });
      expect(storageResult.ok).toBe(false);
      if (!storageResult.ok) {
        expect(storageResult.error.type).toBe('write_error');
      }
    });
  });

  describe('removeValue', () => {
    it('localStorage から値を削除し defaultValue に戻す', () => {
      localStorage.setItem('test-key', JSON.stringify('stored'));
      const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
      expect(result.current.value).toBe('stored');
      act(() => {
        result.current.removeValue();
      });
      expect(result.current.value).toBe('default');
      expect(localStorage.getItem('test-key')).toBeNull();
    });
  });

  describe('SSR 安全性', () => {
    it('localStorage のデータが破損していても defaultValue を返しクラッシュしない', () => {
      localStorage.setItem('test-key', 'invalid-json{{{');
      const { result } = renderHook(() => useLocalStorage('test-key', 'fallback'));
      expect(result.current.value).toBe('fallback');
    });

    it('localStorage の getItem がエラーを投げても defaultValue を返しクラッシュしない', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage not available');
      });
      const { result } = renderHook(() => useLocalStorage('test-key', [] as string[]));
      expect(result.current.value).toEqual([]);
    });

    it('空配列をデフォルト値として渡すと SSR 環境でエラーが発生せず [] が返る', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', [] as string[]));
      expect(result.current.value).toEqual([]);
      expect(() => result.current.value).not.toThrow();
    });
  });
});
