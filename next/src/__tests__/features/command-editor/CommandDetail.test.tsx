import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CommandDetail } from '@/features/command-editor/CommandDetail';
import type { Command } from '@/types';

const sampleCommand: Command = {
  id: 'cmd-1',
  mobileSuit: 'νガンダム',
  name: 'ズンダ',
  sequence: [
    { buttons: ['jump'] },
    { buttons: ['jump'] },
    { buttons: ['shot'] },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('CommandDetail', () => {
  describe('コマンドが存在する場合', () => {
    it('コマンド名が表示される', () => {
      render(<CommandDetail command={sampleCommand} />);
      expect(screen.getByText('ズンダ')).toBeTruthy();
    });

    it('機体名が表示される', () => {
      render(<CommandDetail command={sampleCommand} />);
      expect(screen.getByText('νガンダム')).toBeTruthy();
    });

    it('ボタンシーケンスが表示される', () => {
      render(<CommandDetail command={sampleCommand} />);
      const steps = screen.getAllByTestId('detail-step');
      expect(steps).toHaveLength(3);
    });

    it('単押しボタンのラベルが表示される', () => {
      render(<CommandDetail command={sampleCommand} />);
      // jump×2, shot×1 が表示されるはず
      const jumpEls = screen.getAllByText('ジャンプ');
      expect(jumpEls).toHaveLength(2);
      expect(screen.getByText('射撃')).toBeTruthy();
    });

    it('同時押しが「+」区切りで表示される', () => {
      const cmd: Command = {
        ...sampleCommand,
        sequence: [{ buttons: ['shot', 'melee'] }],
      };
      render(<CommandDetail command={cmd} />);
      expect(screen.getByText('射撃+格闘')).toBeTruthy();
    });
  });

  describe('コマンドが存在しない場合', () => {
    it('「コマンドが見つかりません」メッセージを表示する', () => {
      render(<CommandDetail command={null} />);
      expect(screen.getByText('コマンドが見つかりません')).toBeTruthy();
    });

    it('undefined を渡しても「コマンドが見つかりません」を表示する', () => {
      render(<CommandDetail command={undefined} />);
      expect(screen.getByText('コマンドが見つかりません')).toBeTruthy();
    });
  });
});
