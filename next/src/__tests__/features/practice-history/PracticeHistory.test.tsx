import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PracticeHistory } from '@/features/practice-history/PracticeHistory';
import type { PracticeLog } from '@/types';

const LOGS_KEY = 'ct_practice_logs';

const setLogs = (commandId: string, attempts: { success: boolean; timestamp: string }[]) => {
  const logs: Record<string, PracticeLog> = {
    [commandId]: { commandId, attempts },
  };
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
};

describe('PracticeHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('練習ログが存在しない場合', () => {
    it('「まだ練習していません」を表示する', () => {
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByText('まだ練習していません')).toBeTruthy();
    });

    it('コマンド名を表示する', () => {
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByText('ズンダ')).toBeTruthy();
    });

    it('異なるコマンドIDのログは参照しない', () => {
      setLogs('cmd-2', [{ success: true, timestamp: '2026-01-01T10:00:00.000Z' }]);
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByText('まだ練習していません')).toBeTruthy();
    });
  });

  describe('練習ログが存在する場合', () => {
    it('試行回数を表示する', () => {
      setLogs('cmd-1', [
        { success: true, timestamp: '2026-01-01T10:00:00.000Z' },
        { success: false, timestamp: '2026-01-01T10:01:00.000Z' },
        { success: true, timestamp: '2026-01-01T10:02:00.000Z' },
      ]);
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByTestId('total-attempts').textContent).toContain('3');
    });

    it('成功率を表示する', () => {
      setLogs('cmd-1', [
        { success: true, timestamp: '2026-01-01T10:00:00.000Z' },
        { success: false, timestamp: '2026-01-01T10:01:00.000Z' },
        { success: true, timestamp: '2026-01-01T10:02:00.000Z' },
      ]);
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByTestId('success-rate').textContent).toContain('67');
    });

    it('全成功の場合 100% を表示する', () => {
      setLogs('cmd-1', [
        { success: true, timestamp: '2026-01-01T10:00:00.000Z' },
        { success: true, timestamp: '2026-01-01T10:01:00.000Z' },
      ]);
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByTestId('success-rate').textContent).toContain('100');
    });

    it('全失敗の場合 0% を表示する', () => {
      setLogs('cmd-1', [
        { success: false, timestamp: '2026-01-01T10:00:00.000Z' },
        { success: false, timestamp: '2026-01-01T10:01:00.000Z' },
      ]);
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByTestId('success-rate').textContent).toContain('0');
    });

    it('最終練習日時を表示する', () => {
      setLogs('cmd-1', [
        { success: true, timestamp: '2026-01-01T10:00:00.000Z' },
        { success: false, timestamp: '2026-01-02T15:30:00.000Z' },
      ]);
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByTestId('last-practiced')).toBeTruthy();
    });

    it('コマンド名を表示する', () => {
      setLogs('cmd-1', [{ success: true, timestamp: '2026-01-01T10:00:00.000Z' }]);
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByText('ズンダ')).toBeTruthy();
    });
  });

  describe('3回セッション後の履歴表示', () => {
    it('試行回数と成功率が正しく表示される', () => {
      setLogs('cmd-1', [
        { success: true, timestamp: '2026-01-01T10:00:00.000Z' },
        { success: false, timestamp: '2026-01-01T10:01:00.000Z' },
        { success: true, timestamp: '2026-01-01T10:02:00.000Z' },
        { success: true, timestamp: '2026-01-01T10:03:00.000Z' },
        { success: false, timestamp: '2026-01-01T10:04:00.000Z' },
      ]);
      render(<PracticeHistory commandId="cmd-1" commandName="ズンダ" />);
      expect(screen.getByTestId('total-attempts').textContent).toContain('5');
      expect(screen.getByTestId('success-rate').textContent).toContain('60');
    });
  });
});
