import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CommandHint } from '@/features/practice/CommandHint';
import type { CommandStep } from '@/types';

const zundaSequence: CommandStep[] = [
  { buttons: ['jump'] },
  { buttons: ['jump'] },
  { buttons: ['shot'] },
];

describe('CommandHint', () => {
  describe('ステップ表示', () => {
    it('シーケンス内の全ステップを表示する', () => {
      render(<CommandHint sequence={zundaSequence} currentIndex={0} />);
      const steps = screen.getAllByTestId('hint-step');
      expect(steps).toHaveLength(3);
    });

    it('単押しボタンのラベルを表示する', () => {
      render(<CommandHint sequence={[{ buttons: ['shot'] }]} currentIndex={0} />);
      expect(screen.getByText('射撃')).toBeTruthy();
    });

    it('同時押しのボタンを「+」区切りで表示する', () => {
      render(<CommandHint sequence={[{ buttons: ['shot', 'melee'] }]} currentIndex={0} />);
      expect(screen.getByText('射撃+格闘')).toBeTruthy();
    });
  });

  describe('ハイライト', () => {
    it('currentIndex のステップに data-highlighted="true" が付く', () => {
      render(<CommandHint sequence={zundaSequence} currentIndex={1} />);
      const steps = screen.getAllByTestId('hint-step');
      expect(steps[0].getAttribute('data-highlighted')).toBe('false');
      expect(steps[1].getAttribute('data-highlighted')).toBe('true');
      expect(steps[2].getAttribute('data-highlighted')).toBe('false');
    });

    it('currentIndex=0 で先頭ステップがハイライトされる', () => {
      render(<CommandHint sequence={zundaSequence} currentIndex={0} />);
      const steps = screen.getAllByTestId('hint-step');
      expect(steps[0].getAttribute('data-highlighted')).toBe('true');
    });

    it('currentIndex 変化でハイライト位置が更新される', () => {
      const { rerender } = render(<CommandHint sequence={zundaSequence} currentIndex={0} />);
      let steps = screen.getAllByTestId('hint-step');
      expect(steps[0].getAttribute('data-highlighted')).toBe('true');

      rerender(<CommandHint sequence={zundaSequence} currentIndex={2} />);
      steps = screen.getAllByTestId('hint-step');
      expect(steps[0].getAttribute('data-highlighted')).toBe('false');
      expect(steps[2].getAttribute('data-highlighted')).toBe('true');
    });

    it('誤入力リセット後（currentIndex=0）は先頭ステップが再ハイライトされる', () => {
      const { rerender } = render(<CommandHint sequence={zundaSequence} currentIndex={2} />);
      rerender(<CommandHint sequence={zundaSequence} currentIndex={0} />);
      const steps = screen.getAllByTestId('hint-step');
      expect(steps[0].getAttribute('data-highlighted')).toBe('true');
    });
  });

  describe('空シーケンス', () => {
    it('空シーケンスを渡してもクラッシュしない', () => {
      expect(() => render(<CommandHint sequence={[]} currentIndex={0} />)).not.toThrow();
    });
  });
});
