import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PracticeSession } from '@/features/practice/PracticeSession';
import { flushChargeDeferredInput } from '@/__tests__/utils/flushChargeDeferredInput';
import type { Command } from '@/types';

const shotCommand: Command = {
  id: 'cmd-shot',
  mobileSuit: 'νガンダム',
  name: 'BR',
  sequence: [{ buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const jumpCommand: Command = {
  id: 'cmd-jump',
  mobileSuit: 'νガンダム',
  name: 'ジャンプ',
  sequence: [{ buttons: ['jump'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function pressControllerButton(label: string) {
  await act(async () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: label }));
    fireEvent.pointerUp(screen.getByRole('button', { name: label }));
  });
  await flushChargeDeferredInput();
}

describe('練習セッション結果フロー 統合テスト', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('成功後の SessionResult DOM 確認', () => {
    it('成功後に練習終了すると SessionResult が DOM に存在する', async () => {
      render(<PracticeSession command={shotCommand} onExit={() => {}} />);

      await pressControllerButton('射撃');

      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

      expect(screen.getByTestId('session-result')).toBeTruthy();
    });

    it('成功後のセッション終了で session-result testid が DOM に付与されている', async () => {
      render(<PracticeSession command={shotCommand} onExit={() => {}} />);

      await pressControllerButton('射撃');
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

      const result = screen.getByTestId('session-result');
      expect(result).toBeDefined();
    });

    it('成功1回後のサマリで成功率 100% が DOM に表示される', async () => {
      render(<PracticeSession command={shotCommand} onExit={() => {}} />);

      await pressControllerButton('射撃');
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

      expect(screen.getByTestId('success-rate').textContent).toContain('100');
    });
  });

  describe('失敗後の SessionResult DOM 確認', () => {
    it('失敗後に練習終了すると SessionResult が DOM に存在する', async () => {
      render(<PracticeSession command={jumpCommand} onExit={() => {}} />);

      // ジャンプが正解なのに射撃を押して失敗
      await pressControllerButton('射撃');

      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

      expect(screen.getByTestId('session-result')).toBeTruthy();
    });

    it('失敗後のセッション終了で session-result testid が DOM に付与されている', async () => {
      render(<PracticeSession command={jumpCommand} onExit={() => {}} />);

      await pressControllerButton('射撃');
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

      const result = screen.getByTestId('session-result');
      expect(result).toBeDefined();
    });

    it('失敗1回後のサマリで成功率 0% が DOM に表示される', async () => {
      render(<PracticeSession command={jumpCommand} onExit={() => {}} />);

      await pressControllerButton('射撃');
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

      expect(screen.getByTestId('success-rate').textContent).toContain('0');
    });
  });

  describe('成功・失敗混在後の SessionResult DOM 確認', () => {
    it('成功1回・失敗1回後のサマリが DOM に存在する', async () => {
      render(<PracticeSession command={shotCommand} onExit={() => {}} />);

      // 1回目: 成功
      await pressControllerButton('射撃');
      // 2回目: 失敗（ジャンプは不正解）
      await pressControllerButton('ジャンプ');

      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));

      expect(screen.getByTestId('session-result')).toBeTruthy();
      expect(screen.getByTestId('total-attempts').textContent).toContain('2');
      expect(screen.getByTestId('success-count').textContent).toContain('1');
      expect(screen.getByTestId('success-rate').textContent).toContain('50');
    });
  });

  describe('ControllerButton 成功・失敗状態の DOM 確認', () => {
    it('成功後にコントローラボタンへ data-state="success" が DOM に付与される', async () => {
      render(<PracticeSession command={shotCommand} onExit={() => {}} />);

      await pressControllerButton('射撃');

      const buttons = screen.getAllByRole('button', { name: /射撃|格闘|ジャンプ/ });
      expect(buttons.some((b) => b.getAttribute('data-state') === 'success')).toBe(true);
    });

    it('失敗後にコントローラボタンへ data-state="fail" が DOM に付与される', async () => {
      render(<PracticeSession command={jumpCommand} onExit={() => {}} />);

      await pressControllerButton('射撃');

      const buttons = screen.getAllByRole('button', { name: /射撃|格闘|ジャンプ/ });
      expect(buttons.some((b) => b.getAttribute('data-state') === 'fail')).toBe(true);
    });
  });
});
