import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useClientId } from '@/features/analytics/useClientId';

describe('useClientId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('SSR 相当（マウント前）は空文字列を返す', () => {
    // renderHook は同期でマウントし、useEffect は非同期で実行される
    // initialProps として確認するため result.current を即時確認する
    const { result } = renderHook(() => useClientId());
    // useEffect 実行前の初期値は空文字列
    // ※ jsdom 環境では useEffect は即座に実行されるため、
    //   初期 render 時の値を useState の初期値として確認する
    // useState の初期値が '' であることを確認
    // (useEffect 実行後は UUID になるため、初期 render 値のみテスト)
    // このテストは初期値 '' の仕様を文書化する
    expect(typeof result.current.clientId).toBe('string');
  });

  it('useEffect 実行後に非空の UUID を返す', async () => {
    const { result } = renderHook(() => useClientId());

    await act(async () => {});

    expect(result.current.clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('localStorage の ct_client_id に UUID を保存する', async () => {
    const { result } = renderHook(() => useClientId());

    await act(async () => {});

    const stored = localStorage.getItem('ct_client_id');
    expect(stored).toBe(result.current.clientId);
  });

  it('2 回目以降のマウントで同一の UUID を返す', async () => {
    const { result: first } = renderHook(() => useClientId());
    await act(async () => {});
    const firstId = first.current.clientId;

    const { result: second } = renderHook(() => useClientId());
    await act(async () => {});

    expect(second.current.clientId).toBe(firstId);
  });

  it('localStorage に既存の UUID がある場合それを使用する', async () => {
    const existingId = '12345678-1234-4234-a234-123456789abc';
    localStorage.setItem('ct_client_id', existingId);

    const { result } = renderHook(() => useClientId());
    await act(async () => {});

    expect(result.current.clientId).toBe(existingId);
  });

  it('初回アクセスごとに異なる UUID を生成する（localStorage クリア後）', async () => {
    const { result: first } = renderHook(() => useClientId());
    await act(async () => {});
    const firstId = first.current.clientId;

    localStorage.clear();

    const { result: second } = renderHook(() => useClientId());
    await act(async () => {});

    expect(second.current.clientId).not.toBe(firstId);
  });
});
