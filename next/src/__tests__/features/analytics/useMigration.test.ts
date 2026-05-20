import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

vi.mock('@/features/analytics/apiClient', () => ({
  postMigrate: vi.fn(),
}));

import { useSession } from 'next-auth/react';
import * as apiClient from '@/features/analytics/apiClient';
import { useMigration } from '@/features/analytics/useMigration';

const mockUseSession = vi.mocked(useSession);
const mockPostMigrate = vi.mocked(apiClient.postMigrate);

const loadingSession = { data: null, status: 'loading' as const, update: vi.fn() };
const unauthenticatedSession = { data: null, status: 'unauthenticated' as const, update: vi.fn() };
const authenticatedSession = {
  data: { user: { id: 'user-123', name: 'Test User', email: 'test@example.com', image: null }, expires: '2099-01-01' },
  status: 'authenticated' as const,
  update: vi.fn(),
};

describe('useMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('ローディング中は status が idle', () => {
    mockUseSession.mockReturnValue(loadingSession);

    const { result } = renderHook(() => useMigration());

    expect(result.current.status).toBe('idle');
    expect(mockPostMigrate).not.toHaveBeenCalled();
  });

  it('未認証時は status が idle でマイグレーション不発火', () => {
    mockUseSession.mockReturnValue(unauthenticatedSession);

    const { result } = renderHook(() => useMigration());

    expect(result.current.status).toBe('idle');
    expect(mockPostMigrate).not.toHaveBeenCalled();
  });

  it('ct_synced_at が存在する場合はマイグレーション不発火', async () => {
    localStorage.setItem('ct_synced_at', '2026-01-01T00:00:00.000Z');
    mockUseSession.mockReturnValue(authenticatedSession);

    const { result } = renderHook(() => useMigration());

    await act(async () => {});

    expect(mockPostMigrate).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('認証済み + ct_synced_at なし → postMigrate を呼ぶ', async () => {
    mockUseSession.mockReturnValue(authenticatedSession);
    mockPostMigrate.mockResolvedValue({ migratedCommands: 2, migratedLogs: 5 });

    const { result } = renderHook(() => useMigration());

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });

    expect(mockPostMigrate).toHaveBeenCalledOnce();
  });

  it('マイグレーション成功後に ct_synced_at を localStorage に書き込む', async () => {
    mockUseSession.mockReturnValue(authenticatedSession);
    mockPostMigrate.mockResolvedValue({ migratedCommands: 0, migratedLogs: 0 });

    renderHook(() => useMigration());

    await waitFor(() => {
      expect(localStorage.getItem('ct_synced_at')).not.toBeNull();
    });

    const synced = localStorage.getItem('ct_synced_at');
    expect(synced).toBeTruthy();
  });

  it('マイグレーション失敗時に ct_synced_at を書き込まない', async () => {
    mockUseSession.mockReturnValue(authenticatedSession);
    mockPostMigrate.mockResolvedValue(null);

    const { result } = renderHook(() => useMigration());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(localStorage.getItem('ct_synced_at')).toBeNull();
  });

  it('postMigrate が例外を投げた場合も ct_synced_at を書き込まない', async () => {
    mockUseSession.mockReturnValue(authenticatedSession);
    mockPostMigrate.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMigration());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(localStorage.getItem('ct_synced_at')).toBeNull();
  });

  it('localStorage の ct_commands と ct_practice_logs を読み取って渡す', async () => {
    const commands = [{ id: 'cmd-1', mobileSuit: 'νガンダム', name: 'ズンダ', sequence: [], createdAt: '2026-01-01T00:00:00.000Z' }];
    const practiceLogs = { 'cmd-1': { commandId: 'cmd-1', attempts: 3, successes: 2, lastPracticed: '2026-01-01T00:00:00.000Z' } };
    localStorage.setItem('ct_commands', JSON.stringify(commands));
    localStorage.setItem('ct_practice_logs', JSON.stringify(practiceLogs));

    mockUseSession.mockReturnValue(authenticatedSession);
    mockPostMigrate.mockResolvedValue({ migratedCommands: 1, migratedLogs: 1 });

    renderHook(() => useMigration());

    await waitFor(() => {
      expect(mockPostMigrate).toHaveBeenCalledWith(
        expect.objectContaining({
          commands,
          practiceLogs,
        }),
      );
    });
  });

  it('localStorage にデータが無い場合は空で渡す', async () => {
    mockUseSession.mockReturnValue(authenticatedSession);
    mockPostMigrate.mockResolvedValue({ migratedCommands: 0, migratedLogs: 0 });

    renderHook(() => useMigration());

    await waitFor(() => {
      expect(mockPostMigrate).toHaveBeenCalledWith(
        expect.objectContaining({ commands: [], practiceLogs: {} }),
      );
    });
  });
});
