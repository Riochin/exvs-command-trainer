import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PracticePageContent } from '@/app/practice/[commandId]/PracticePageContent';
import type { Command } from '@/types';

vi.mock('@/hooks/useCommandStore', () => ({
  useCommandStore: vi.fn(),
}));
vi.mock('@/hooks/useLandscapeMode', () => ({
  useLandscapeMode: vi.fn(),
}));
vi.mock('@/hooks/usePracticeLog', () => ({
  usePracticeLog: vi.fn(),
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
import { usePracticeLog } from '@/hooks/usePracticeLog';
import { useRouter } from 'next/navigation';

const mockUseCommandStore = vi.mocked(useCommandStore);
const mockUseLandscapeMode = vi.mocked(useLandscapeMode);
const mockUsePracticeLog = vi.mocked(usePracticeLog);
const mockUseRouter = vi.mocked(useRouter);

const zundaCommand: Command = {
  id: 'cmd-1',
  mobileSuit: 'νガンダム',
  name: 'ズンダ',
  sequence: [{ buttons: ['jump'] }, { buttons: ['jump'] }, { buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('PracticePageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLandscapeMode.mockReturnValue({ isLandscape: true });
    mockUseRouter.mockReturnValue({ push: vi.fn() } as ReturnType<typeof useRouter>);
    mockUsePracticeLog.mockReturnValue({
      getLog: vi.fn(() => null),
      recordAttempt: vi.fn(() => ({ ok: true as const, value: undefined })),
      clearLog: vi.fn(),
      isLoading: false,
      lastError: null,
    });
  });

  describe('コマンドが存在する場合', () => {
    beforeEach(() => {
      mockUseCommandStore.mockReturnValue({
        commands: [zundaCommand],
        isLoading: false,
        lastError: null,
        addCommand: vi.fn(),
        removeCommand: vi.fn(),
        getCommand: vi.fn(() => zundaCommand),
        getCommandsByMobileSuit: vi.fn(),
      });
    });

    it('PracticeSession が表示される', () => {
      render(<PracticePageContent commandId="cmd-1" />);
      expect(screen.getByTestId('practice-session')).toBeTruthy();
    });

    it('ArcadeController が表示される', () => {
      render(<PracticePageContent commandId="cmd-1" />);
      expect(screen.getByTestId('arcade-controller')).toBeTruthy();
    });

    it('縦画面時は回転促進メッセージが表示される', () => {
      mockUseLandscapeMode.mockReturnValue({ isLandscape: false });
      render(<PracticePageContent commandId="cmd-1" />);
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('横画面時はコンテンツが表示される', () => {
      mockUseLandscapeMode.mockReturnValue({ isLandscape: true });
      render(<PracticePageContent commandId="cmd-1" />);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('コマンドが存在しない場合', () => {
    beforeEach(() => {
      mockUseCommandStore.mockReturnValue({
        commands: [],
        isLoading: false,
        lastError: null,
        addCommand: vi.fn(),
        removeCommand: vi.fn(),
        getCommand: vi.fn(() => undefined),
        getCommandsByMobileSuit: vi.fn(),
      });
    });

    it('「コマンドが見つかりません」メッセージを表示する', () => {
      render(<PracticePageContent commandId="nonexistent" />);
      expect(screen.getByText(/コマンドが見つかりません/)).toBeTruthy();
    });

    it('/コマンド一覧へのリンクを表示する', () => {
      render(<PracticePageContent commandId="nonexistent" />);
      const links = screen.getAllByRole('link');
      const homeLinks = links.filter((l) => l.getAttribute('href') === '/');
      expect(homeLinks.length).toBeGreaterThan(0);
    });
  });
});
