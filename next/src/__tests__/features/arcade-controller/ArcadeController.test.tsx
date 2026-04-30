import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';

describe('ArcadeController', () => {
  it('4つのボタン（射撃・格闘・ジャンプ・覚醒）が表示される', () => {
    render(<ArcadeController />);
    expect(screen.getByText('射撃')).toBeTruthy();
    expect(screen.getByText('格闘')).toBeTruthy();
    expect(screen.getByText('ジャンプ')).toBeTruthy();
    expect(screen.getByText('覚醒')).toBeTruthy();
  });

  it('ボタンが4つ存在する', () => {
    render(<ArcadeController />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
  });

  describe('onButtonPress モード（練習モード）', () => {
    it('ボタン押下で onButtonPress が呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      fireEvent.pointerDown(screen.getByText('射撃'));
      expect(onButtonPress).toHaveBeenCalledWith('shot');
    });

    it('格闘ボタン押下で onButtonPress が "melee" で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      fireEvent.pointerDown(screen.getByText('格闘'));
      expect(onButtonPress).toHaveBeenCalledWith('melee');
    });

    it('ジャンプボタン押下で onButtonPress が "jump" で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      fireEvent.pointerDown(screen.getByText('ジャンプ'));
      expect(onButtonPress).toHaveBeenCalledWith('jump');
    });

    it('覚醒ボタン押下で onButtonPress が "awaken" で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      fireEvent.pointerDown(screen.getByText('覚醒'));
      expect(onButtonPress).toHaveBeenCalledWith('awaken');
    });
  });

  describe('onStepAdded モード（登録モード）', () => {
    it('ボタン押下で onStepAdded が CommandStep として呼ばれる', () => {
      const onStepAdded = vi.fn();
      render(<ArcadeController onStepAdded={onStepAdded} />);
      fireEvent.pointerDown(screen.getByText('ジャンプ'));
      expect(onStepAdded).toHaveBeenCalledWith({ buttons: ['jump'] });
    });

    it('onButtonPress と onStepAdded の両方が渡された場合、onButtonPress が優先される', () => {
      const onButtonPress = vi.fn();
      const onStepAdded = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} onStepAdded={onStepAdded} />);
      fireEvent.pointerDown(screen.getByText('射撃'));
      expect(onButtonPress).toHaveBeenCalledWith('shot');
      expect(onStepAdded).not.toHaveBeenCalled();
    });
  });

  describe('highlightedButton', () => {
    it('highlightedButton に指定されたボタンに data-highlighted が設定される', () => {
      render(<ArcadeController highlightedButton="jump" />);
      const jumpButton = screen.getByText('ジャンプ').closest('button');
      expect(jumpButton?.getAttribute('data-highlighted')).toBe('true');
    });

    it('highlightedButton に指定されていないボタンに data-highlighted がない', () => {
      render(<ArcadeController highlightedButton="jump" />);
      const shotButton = screen.getByText('射撃').closest('button');
      expect(shotButton?.getAttribute('data-highlighted')).toBeNull();
    });

    it('highlightedButton が null/未指定のとき全ボタンに data-highlighted がない', () => {
      render(<ArcadeController />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((btn) => {
        expect(btn.getAttribute('data-highlighted')).toBeNull();
      });
    });
  });

  describe('activeButtons（押下中スタイル）', () => {
    it('ボタン押下中は aria-pressed が true になる', () => {
      render(<ArcadeController />);
      const shotEl = screen.getByText('射撃').closest('button')!;
      expect(shotEl.getAttribute('aria-pressed')).toBe('false');

      act(() => {
        fireEvent.pointerDown(shotEl, { pointerId: 1 });
      });
      expect(shotEl.getAttribute('aria-pressed')).toBe('true');
    });

    it('ポインターアップ後は aria-pressed が false に戻る', () => {
      render(<ArcadeController />);
      const shotEl = screen.getByText('射撃').closest('button')!;

      act(() => {
        fireEvent.pointerDown(shotEl, { pointerId: 1 });
      });
      act(() => {
        fireEvent.pointerUp(shotEl, { pointerId: 1 });
      });
      expect(shotEl.getAttribute('aria-pressed')).toBe('false');
    });
  });
});
