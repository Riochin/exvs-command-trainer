import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HomePage from '@/app/page';
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
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { useCommandStore } from '@/hooks/useCommandStore';
import { useLandscapeMode } from '@/hooks/useLandscapeMode';
import { useRouter } from 'next/navigation';

const mockUseCommandStore = vi.mocked(useCommandStore);
const mockUseLandscapeMode = vi.mocked(useLandscapeMode);
const mockUseRouter = vi.mocked(useRouter);

const makeCommand = (
  overrides: Partial<Command> & { id: string; mobileSuit: string; name: string },
): Command => ({
  sequence: [{ buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const emptyStore = () =>
  mockUseCommandStore.mockReturnValue({
    commands: [],
    isLoading: false,
    lastError: null,
    addCommand: vi.fn(),
    removeCommand: vi.fn(),
    getCommand: vi.fn(),
    getCommandsByMobileSuit: vi.fn(),
  });

describe('ホームページ CapsuleButton 統合テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLandscapeMode.mockReturnValue({ isLandscape: true });
    mockUseRouter.mockReturnValue({ push: vi.fn() } as ReturnType<typeof useRouter>);
    emptyStore();
  });

  describe('コマンド登録 CapsuleButton（href リンク）', () => {
    it('「コマンドを登録する」が link 要素として DOM に存在する', () => {
      render(<HomePage />);
      const links = screen.getAllByRole('link', { name: /コマンドを登録する/ });
      expect(links.length).toBeGreaterThan(0);
    });

    it('CapsuleButton の href が /commands/new に設定されている', () => {
      render(<HomePage />);
      const links = screen.getAllByRole('link', { name: /コマンドを登録する/ });
      links.forEach((link) => {
        expect(link.getAttribute('href')).toBe('/commands/new');
      });
    });

    it('CapsuleButton リンクをクリックしてもエラーが発生しない', () => {
      render(<HomePage />);
      const link = screen.getAllByRole('link', { name: /コマンドを登録する/ })[0];
      expect(() => fireEvent.click(link)).not.toThrow();
    });
  });

  describe('コマンドありの場合', () => {
    beforeEach(() => {
      mockUseCommandStore.mockReturnValue({
        commands: [makeCommand({ id: '1', mobileSuit: 'νガンダム', name: 'ズンダ' })],
        isLoading: false,
        lastError: null,
        addCommand: vi.fn(),
        removeCommand: vi.fn(),
        getCommand: vi.fn(),
        getCommandsByMobileSuit: vi.fn(),
      });
    });

    it('コマンドリストが表示される', () => {
      render(<HomePage />);
      expect(screen.getByText('ズンダ')).toBeTruthy();
    });

    it('ヘッダーの CapsuleButton リンクが /commands/new へ遷移できる', () => {
      render(<HomePage />);
      const headerLink = screen.getByRole('link', { name: /コマンドを登録する/ });
      expect(headerLink.getAttribute('href')).toBe('/commands/new');
    });

    it('コマンド選択ボタンをクリックすると router.push が呼ばれる', () => {
      const push = vi.fn();
      mockUseRouter.mockReturnValue({ push } as ReturnType<typeof useRouter>);
      render(<HomePage />);
      fireEvent.click(screen.getByRole('button', { name: 'ズンダ' }));
      expect(push).toHaveBeenCalledWith('/commands/1');
    });
  });

  describe('コマンドなしの場合', () => {
    it('CapsuleButton が複数表示される（ヘッダー＋本文）', () => {
      render(<HomePage />);
      const links = screen.getAllByRole('link', { name: /コマンドを登録する/ });
      expect(links.length).toBeGreaterThanOrEqual(2);
    });
  });
});
