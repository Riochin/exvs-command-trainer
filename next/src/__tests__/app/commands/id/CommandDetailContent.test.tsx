import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandDetailContent } from '@/app/commands/[id]/CommandDetailContent';
import type { Command } from '@/types';

vi.mock('@/hooks/useCommandStore', () => ({
  useCommandStore: vi.fn(),
}));
vi.mock('@/hooks/usePracticeLog', () => ({
  usePracticeLog: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

import { useCommandStore } from '@/hooks/useCommandStore';
import { usePracticeLog } from '@/hooks/usePracticeLog';
import { useRouter } from 'next/navigation';

const mockUseCommandStore = vi.mocked(useCommandStore);
const mockUsePracticeLog = vi.mocked(usePracticeLog);
const mockUseRouter = vi.mocked(useRouter);

const zundaCommand: Command = {
  id: 'cmd-1',
  mobileSuit: 'νガンダム',
  name: 'ズンダ',
  sequence: [{ buttons: ['jump'] }, { buttons: ['jump'] }, { buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('CommandDetailContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRouter.mockReturnValue({ push: vi.fn() } as ReturnType<typeof useRouter>);
    mockUsePracticeLog.mockReturnValue({
      getLog: vi.fn(() => null),
      recordAttempt: vi.fn(),
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

    it('コマンド名が表示される', () => {
      render(<CommandDetailContent commandId="cmd-1" />);
      expect(screen.getAllByText('ズンダ').length).toBeGreaterThan(0);
    });

    it('機体名が表示される', () => {
      render(<CommandDetailContent commandId="cmd-1" />);
      expect(screen.getByText('νガンダム')).toBeTruthy();
    });

    it('練習履歴が表示される', () => {
      render(<CommandDetailContent commandId="cmd-1" />);
      expect(screen.getByTestId('practice-history')).toBeTruthy();
    });

    it('「練習を開始する」ボタンが表示される', () => {
      render(<CommandDetailContent commandId="cmd-1" />);
      expect(screen.getByRole('button', { name: /練習を開始/ })).toBeTruthy();
    });

    it('「練習を開始する」を押すと /practice/[id] に遷移する', () => {
      const push = vi.fn();
      mockUseRouter.mockReturnValue({ push } as ReturnType<typeof useRouter>);
      render(<CommandDetailContent commandId="cmd-1" />);
      fireEvent.click(screen.getByRole('button', { name: /練習を開始/ }));
      expect(push).toHaveBeenCalledWith('/practice/cmd-1');
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
      render(<CommandDetailContent commandId="nonexistent" />);
      expect(screen.getByText(/コマンドが見つかりません/)).toBeTruthy();
    });
  });
});
