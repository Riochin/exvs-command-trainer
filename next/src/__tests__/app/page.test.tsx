import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommandsPage from '@/app/commands/page';
import type { Command } from '@/types';

vi.mock('@/hooks/useCommandStore', () => ({
  useCommandStore: vi.fn(),
}));
vi.mock('@/hooks/useLandscapeMode', () => ({
  useLandscapeMode: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn().mockReturnValue({ data: null, status: 'unauthenticated' }),
}));
vi.mock('@/features/analytics/useAnalytics', () => ({
  useAnalytics: vi.fn().mockReturnValue({
    trackSessionStart: vi.fn(),
    trackAttempt: vi.fn(),
    trackSessionEnd: vi.fn(),
    trackPageView: vi.fn(),
    trackEvent: vi.fn(),
  }),
}));
vi.mock('@/features/analytics/useClientId', () => ({
  useClientId: vi.fn().mockReturnValue({ clientId: 'test-client-id' }),
}));

import { useCommandStore } from '@/hooks/useCommandStore';
import { useLandscapeMode } from '@/hooks/useLandscapeMode';
import { useRouter } from 'next/navigation';

const mockUseCommandStore = vi.mocked(useCommandStore);
const mockUseLandscapeMode = vi.mocked(useLandscapeMode);
const mockUseRouter = vi.mocked(useRouter);

const makeCommand = (overrides: Partial<Command> & { id: string; mobileSuit: string; name: string }): Command => ({
  sequence: [{ buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const mockStore = (commands: Command[]) =>
  mockUseCommandStore.mockReturnValue({
    commands,
    isLoading: false,
    lastError: null,
    addCommand: vi.fn(),
    removeCommand: vi.fn(),
    getCommand: vi.fn(),
    getCommandsByMobileSuit: vi.fn(),
  });

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLandscapeMode.mockReturnValue({ isLandscape: true });
    mockUseRouter.mockReturnValue({ push: vi.fn() } as ReturnType<typeof useRouter>);
    mockStore([]);
  });

  describe('コマンドが空の場合', () => {
    it('登録を促すメッセージを表示する', () => {
      render(<CommandsPage />);
      expect(screen.getByText(/コマンドが登録されていません/)).toBeTruthy();
    });

    it('/commands/new へのリンクを表示する', () => {
      render(<CommandsPage />);
      const links = screen.getAllByRole('link');
      const registerLinks = links.filter((l) => l.getAttribute('href') === '/commands/new');
      expect(registerLinks.length).toBeGreaterThan(0);
    });
  });

  describe('コマンドがある場合', () => {
    it('コマンドが機体名でグループ化されて表示される', () => {
      mockStore([
        makeCommand({ id: '1', mobileSuit: 'νガンダム', name: 'ズンダ' }),
        makeCommand({ id: '2', mobileSuit: 'νガンダム', name: 'BR' }),
        makeCommand({ id: '3', mobileSuit: 'ストライクフリーダム', name: 'クロスボーン' }),
      ]);
      render(<CommandsPage />);
      expect(screen.getByText('νガンダム')).toBeTruthy();
      expect(screen.getByText('ストライクフリーダム')).toBeTruthy();
      expect(screen.getByText('ズンダ')).toBeTruthy();
    });

    it('コマンドを選択すると /commands/[id] に遷移する', () => {
      const push = vi.fn();
      mockUseRouter.mockReturnValue({ push } as ReturnType<typeof useRouter>);
      mockStore([makeCommand({ id: 'cmd-1', mobileSuit: 'νガンダム', name: 'ズンダ' })]);
      render(<CommandsPage />);
      fireEvent.click(screen.getByRole('button', { name: 'ズンダ' }));
      expect(push).toHaveBeenCalledWith('/commands/cmd-1');
    });

    it('コマンドを削除すると removeCommand が呼ばれる', () => {
      const removeCommand = vi.fn();
      mockUseCommandStore.mockReturnValue({
        commands: [makeCommand({ id: 'cmd-1', mobileSuit: 'νガンダム', name: 'ズンダ' })],
        isLoading: false,
        lastError: null,
        addCommand: vi.fn(),
        removeCommand,
        getCommand: vi.fn(),
        getCommandsByMobileSuit: vi.fn(),
      });
      render(<CommandsPage />);
      fireEvent.click(screen.getByRole('button', { name: /ズンダを削除/ }));
      fireEvent.click(screen.getByRole('button', { name: /削除する/ }));
      expect(removeCommand).toHaveBeenCalledWith('cmd-1');
    });
  });

  describe('LandscapeGuard', () => {
    it('縦画面時は回転促進メッセージが表示される', () => {
      mockUseLandscapeMode.mockReturnValue({ isLandscape: false });
      render(<CommandsPage />);
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('横画面時はコンテンツが表示される', () => {
      mockUseLandscapeMode.mockReturnValue({ isLandscape: true });
      render(<CommandsPage />);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
