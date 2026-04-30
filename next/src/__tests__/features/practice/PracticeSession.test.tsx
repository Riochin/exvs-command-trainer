import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PracticeSession } from '@/features/practice/PracticeSession';
import type { Command } from '@/types';

const zundaCommand: Command = {
  id: 'cmd-zunda',
  mobileSuit: 'ストライクフリーダム',
  name: 'ズンダ',
  sequence: [
    { buttons: ['jump'] },
    { buttons: ['jump'] },
    { buttons: ['shot'] },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

// ArcadeController 内のボタンのみを取得する（CommandHint と区別するため role="button" でフィルタ）
const getControllerButton = (label: string) => screen.getByRole('button', { name: label });

describe('PracticeSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('初期表示', () => {
    it('CommandHint が表示される', () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      expect(screen.getByTestId('command-hint')).toBeTruthy();
    });

    it('ArcadeController が表示される', () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      expect(screen.getByTestId('arcade-controller')).toBeTruthy();
    });

    it('試行カウンタが表示される', () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      expect(screen.getByTestId('attempt-counter')).toBeTruthy();
    });

    it('「練習終了」ボタンが表示される', () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      expect(screen.getByRole('button', { name: /練習終了/ })).toBeTruthy();
    });
  });

  describe('ボタン入力', () => {
    it('正しい順序でボタンを押すと成功フィードバックが表示される', async () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('ジャンプ'));
        fireEvent.pointerUp(getControllerButton('ジャンプ'));
      });
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('ジャンプ'));
        fireEvent.pointerUp(getControllerButton('ジャンプ'));
      });
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃'));
        fireEvent.pointerUp(getControllerButton('射撃'));
      });
      expect(screen.getByTestId('result-success')).toBeTruthy();
    });

    it('間違ったボタンを押すと失敗フィードバックが表示される', async () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃')); // 最初は jump が正解
        fireEvent.pointerUp(getControllerButton('射撃'));
      });
      expect(screen.getByTestId('result-failure')).toBeTruthy();
    });

    it('成功後に試行カウンタが更新される', async () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('ジャンプ'));
        fireEvent.pointerUp(getControllerButton('ジャンプ'));
      });
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('ジャンプ'));
        fireEvent.pointerUp(getControllerButton('ジャンプ'));
      });
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃'));
        fireEvent.pointerUp(getControllerButton('射撃'));
      });
      const counter = screen.getByTestId('attempt-counter');
      expect(counter.textContent).toContain('1'); // 試行1回
    });
  });

  describe('セッション終了', () => {
    it('「練習終了」ボタンを押すと SessionResult が表示される', () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));
      expect(screen.getByTestId('session-result')).toBeTruthy();
    });

    it('SessionResult の「終了」ボタンで onExit が呼ばれる', () => {
      const onExit = vi.fn();
      render(<PracticeSession command={zundaCommand} onExit={onExit} />);
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));
      fireEvent.click(screen.getByRole('button', { name: /終了/ }));
      expect(onExit).toHaveBeenCalledOnce();
    });

    it('SessionResult の「もう一度」ボタンでセッションが再開される', () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));
      expect(screen.getByTestId('session-result')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /もう一度/ }));
      expect(screen.getByTestId('arcade-controller')).toBeTruthy();
    });
  });
});
