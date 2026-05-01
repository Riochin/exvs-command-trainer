import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommandNewPage from '@/app/commands/new/page';

vi.mock('@/hooks/useCommandStore', () => ({
  useCommandStore: vi.fn(),
}));
vi.mock('@/hooks/useLandscapeMode', () => ({
  useLandscapeMode: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

import { useCommandStore } from '@/hooks/useCommandStore';
import { useLandscapeMode } from '@/hooks/useLandscapeMode';
import { useRouter } from 'next/navigation';

const mockUseCommandStore = vi.mocked(useCommandStore);
const mockUseLandscapeMode = vi.mocked(useLandscapeMode);
const mockUseRouter = vi.mocked(useRouter);

describe('CommandNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLandscapeMode.mockReturnValue({ isLandscape: true });
    mockUseRouter.mockReturnValue({ push: vi.fn() } as ReturnType<typeof useRouter>);
    mockUseCommandStore.mockReturnValue({
      commands: [],
      isLoading: false,
      lastError: null,
      addCommand: vi.fn(() => ({
        ok: true as const,
        value: { id: '1', mobileSuit: 'ν', name: 'test', sequence: [{ buttons: ['shot'] as ['shot'] }], createdAt: '' },
      })),
      removeCommand: vi.fn(),
      getCommand: vi.fn(),
      getCommandsByMobileSuit: vi.fn(),
    });
  });

  it('CommandForm が表示される', () => {
    render(<CommandNewPage />);
    expect(screen.getByLabelText('機体名')).toBeTruthy();
    expect(screen.getByLabelText('コマンド名')).toBeTruthy();
  });

  it('コマンド登録成功後に / へリダイレクトする', async () => {
    const push = vi.fn();
    mockUseRouter.mockReturnValue({ push } as ReturnType<typeof useRouter>);
    render(<CommandNewPage />);
    fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
    fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'ズンダ' } });
    await act(async () => {
      fireEvent.pointerDown(screen.getByText('射撃'));
      fireEvent.pointerUp(screen.getByText('射撃'));
    });
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    expect(push).toHaveBeenCalledWith('/');
  });
});
