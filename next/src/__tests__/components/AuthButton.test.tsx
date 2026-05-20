import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { useSession, signIn, signOut } from 'next-auth/react';
import { AuthButton } from '@/components/AuthButton';

const mockUseSession = vi.mocked(useSession);
const mockSignIn = vi.mocked(signIn);
const mockSignOut = vi.mocked(signOut);

describe('AuthButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('未認証状態', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn(),
      });
    });

    it('ログインボタンを表示する', () => {
      render(<AuthButton />);
      expect(screen.getByRole('button', { name: /ログイン/ })).toBeTruthy();
    });

    it('アバター画像を表示しない', () => {
      render(<AuthButton />);
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('ログインボタンのタップで signIn("google") が呼ばれる', () => {
      render(<AuthButton />);

      fireEvent.click(screen.getByRole('button', { name: /ログイン/ }));

      expect(mockSignIn).toHaveBeenCalledWith('google');
    });
  });

  describe('認証済み状態', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: {
          user: { id: 'user-123', name: 'テストユーザー', email: 'test@example.com', image: 'https://example.com/avatar.jpg' },
          expires: '2099-01-01',
        },
        status: 'authenticated',
        update: vi.fn(),
      });
    });

    it('表示名を表示する', () => {
      render(<AuthButton />);
      expect(screen.getByText('テストユーザー')).toBeTruthy();
    });

    it('アバター画像を表示する', () => {
      render(<AuthButton />);
      const img = screen.getByRole('img');
      expect(img).toBeTruthy();
      // Next.js Image は URL をエンコードするため URL エンコード形式で確認
      const src = img.getAttribute('src') ?? '';
      expect(src.includes('example.com') || src.includes('example.com%2F')).toBe(true);
    });

    it('ログアウトボタンを表示する', () => {
      render(<AuthButton />);
      expect(screen.getByRole('button', { name: /ログアウト/ })).toBeTruthy();
    });

    it('ログアウトボタンのタップで signOut() が呼ばれる', () => {
      render(<AuthButton />);

      fireEvent.click(screen.getByRole('button', { name: /ログアウト/ }));

      expect(mockSignOut).toHaveBeenCalled();
    });

    it('ログインボタンを表示しない', () => {
      render(<AuthButton />);
      expect(screen.queryByRole('button', { name: /ログイン/ })).toBeNull();
    });
  });

  describe('ローディング状態', () => {
    it('何も表示しない or ローディング UI を表示する（エラーなし）', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
        update: vi.fn(),
      });

      expect(() => render(<AuthButton />)).not.toThrow();
    });
  });
});
