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
      const steps = screen.getAllByTestId('detail-step');
      const jumpSteps = steps.filter((el) => el.textContent?.includes('ジャ'));
      expect(jumpSteps).toHaveLength(2);
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

  describe('チャージペア表示', () => {
    it('隣接する射CS開始・終了は1つの「射CS」として表示される', () => {
      const cmd: Command = {
        ...sampleCommand,
        sequence: [
          { buttons: ['shot-charge-start'] },
          { buttons: ['shot-charge-end'] },
          { buttons: ['shot'] },
        ],
      };
      render(<CommandDetail command={cmd} />);
      const steps = screen.getAllByTestId('detail-step');
      expect(steps).toHaveLength(2);
      expect(steps[0].textContent).toContain('射CS');
      expect(steps[1].textContent).toContain('射撃');
    });

    it('隣接する格CS開始・終了は1つの「格CS」として表示される', () => {
      const cmd: Command = {
        ...sampleCommand,
        sequence: [
          { buttons: ['melee-charge-start'] },
          { buttons: ['melee-charge-end'] },
        ],
      };
      render(<CommandDetail command={cmd} />);
      const steps = screen.getAllByTestId('detail-step');
      expect(steps).toHaveLength(1);
      expect(steps[0].textContent).toContain('格CS');
    });

    it('隣接しない射CS開始・終了はそれぞれ別々に表示される', () => {
      const cmd: Command = {
        ...sampleCommand,
        sequence: [
          { buttons: ['shot-charge-start'] },
          { buttons: ['shot'] },
          { buttons: ['shot-charge-end'] },
        ],
      };
      render(<CommandDetail command={cmd} />);
      const steps = screen.getAllByTestId('detail-step');
      expect(steps).toHaveLength(3);
    });

    it('ペア後のステップ番号は連番になる', () => {
      const cmd: Command = {
        ...sampleCommand,
        sequence: [
          { buttons: ['shot-charge-start'] },
          { buttons: ['shot-charge-end'] },
          { buttons: ['shot'] },
        ],
      };
      render(<CommandDetail command={cmd} />);
      const steps = screen.getAllByTestId('detail-step');
      expect(steps[0].textContent).toContain('1');
      expect(steps[1].textContent).toContain('2');
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
