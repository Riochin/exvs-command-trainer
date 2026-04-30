import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SessionResult } from '@/features/practice/SessionResult';
import type { PracticeAttempt } from '@/types';

const makeAttempt = (success: boolean): PracticeAttempt => ({
  success,
  timestamp: '2026-01-01T00:00:00.000Z',
});

describe('SessionResult', () => {
  describe('コマンド情報', () => {
    it('コマンド名が表示される', () => {
      render(
        <SessionResult
          attempts={[makeAttempt(true)]}
          commandName="ズンダ"
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );
      expect(screen.getByText('ズンダ')).toBeTruthy();
    });
  });

  describe('試行統計', () => {
    it('総試行数を表示する', () => {
      render(
        <SessionResult
          attempts={[makeAttempt(true), makeAttempt(false), makeAttempt(true)]}
          commandName="ズンダ"
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );
      expect(screen.getByTestId('total-attempts').textContent).toContain('3');
    });

    it('成功数を表示する', () => {
      render(
        <SessionResult
          attempts={[makeAttempt(true), makeAttempt(false), makeAttempt(true)]}
          commandName="ズンダ"
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );
      expect(screen.getByTestId('success-count').textContent).toContain('2');
    });

    it('成功率（%）を計算して表示する', () => {
      render(
        <SessionResult
          attempts={[makeAttempt(true), makeAttempt(false), makeAttempt(true)]}
          commandName="ズンダ"
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );
      expect(screen.getByTestId('success-rate').textContent).toContain('67');
    });

    it('全成功の場合 100% を表示する', () => {
      render(
        <SessionResult
          attempts={[makeAttempt(true), makeAttempt(true)]}
          commandName="ズンダ"
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );
      expect(screen.getByTestId('success-rate').textContent).toContain('100');
    });

    it('全失敗の場合 0% を表示する', () => {
      render(
        <SessionResult
          attempts={[makeAttempt(false), makeAttempt(false)]}
          commandName="ズンダ"
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );
      expect(screen.getByTestId('success-rate').textContent).toContain('0');
    });
  });

  describe('試行0回の場合', () => {
    it('クラッシュせず表示される', () => {
      expect(() =>
        render(
          <SessionResult
            attempts={[]}
            commandName="ズンダ"
            onRetry={vi.fn()}
            onExit={vi.fn()}
          />,
        ),
      ).not.toThrow();
    });

    it('「まだ練習していません」メッセージを表示する', () => {
      render(
        <SessionResult
          attempts={[]}
          commandName="ズンダ"
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );
      expect(screen.getByText('まだ練習していません')).toBeTruthy();
    });
  });

  describe('アクション', () => {
    it('「もう一度」ボタンで onRetry が呼ばれる', () => {
      const onRetry = vi.fn();
      render(
        <SessionResult
          attempts={[makeAttempt(true)]}
          commandName="ズンダ"
          onRetry={onRetry}
          onExit={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /もう一度/ }));
      expect(onRetry).toHaveBeenCalledOnce();
    });

    it('「終了」ボタンで onExit が呼ばれる', () => {
      const onExit = vi.fn();
      render(
        <SessionResult
          attempts={[makeAttempt(true)]}
          commandName="ズンダ"
          onRetry={vi.fn()}
          onExit={onExit}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /終了/ }));
      expect(onExit).toHaveBeenCalledOnce();
    });
  });
});
