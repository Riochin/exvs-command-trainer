import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArcadeController } from '@/features/arcade-controller/ArcadeController';
import { CHARGE_THRESHOLD_MS } from '@/hooks/useChargeInput';

describe('ArcadeController', () => {
  it('3つのボタン（射撃・格闘・ジャンプ）が表示される', () => {
    render(<ArcadeController />);
    expect(screen.getByText('射撃')).toBeTruthy();
    expect(screen.getByText('格闘')).toBeTruthy();
    expect(screen.getByText('ジャンプ')).toBeTruthy();
  });

  it('ボタンが3つ存在する', () => {
    render(<ArcadeController />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  describe('onButtonPress モード（練習モード）', () => {
    it('射撃を短押しで onButtonPress が "shot" で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const el = screen.getByText('射撃').closest('button')!;
      fireEvent.pointerDown(el, { pointerId: 1 });
      fireEvent.pointerUp(el, { pointerId: 1 });
      expect(onButtonPress).toHaveBeenCalledWith('shot');
    });

    it('格闘を短押しで onButtonPress が "melee" で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const el = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(el, { pointerId: 1 });
      fireEvent.pointerUp(el, { pointerId: 1 });
      expect(onButtonPress).toHaveBeenCalledWith('melee');
    });

    it('ジャンプボタン押下で onButtonPress が "jump" で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      fireEvent.pointerDown(screen.getByText('ジャンプ'));
      expect(onButtonPress).toHaveBeenCalledWith('jump');
    });

    it('射撃+格闘の同時押しで onButtonPress が "sub" で1回呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const shot = screen.getByText('射撃').closest('button')!;
      const melee = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(shot, { pointerId: 1 });
      fireEvent.pointerDown(melee, { pointerId: 2 });
      expect(onButtonPress).toHaveBeenCalledTimes(1);
      expect(onButtonPress).toHaveBeenCalledWith('sub');
    });

    it('格闘→射撃の順でも sub が発火する', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const shot = screen.getByText('射撃').closest('button')!;
      const melee = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(melee, { pointerId: 2 });
      fireEvent.pointerDown(shot, { pointerId: 1 });
      expect(onButtonPress).toHaveBeenCalledWith('sub');
    });

    it('射撃保持中にジャンプで onButtonPress が "special-shot" で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const shot = screen.getByText('射撃').closest('button')!;
      const jump = screen.getByText('ジャンプ').closest('button')!;
      fireEvent.pointerDown(shot, { pointerId: 1 });
      fireEvent.pointerDown(jump, { pointerId: 2 });
      expect(onButtonPress).toHaveBeenCalledWith('special-shot');
    });

    it('格闘保持中にジャンプで onButtonPress が "special-melee" で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const melee = screen.getByText('格闘').closest('button')!;
      const jump = screen.getByText('ジャンプ').closest('button')!;
      fireEvent.pointerDown(melee, { pointerId: 1 });
      fireEvent.pointerDown(jump, { pointerId: 2 });
      expect(onButtonPress).toHaveBeenCalledWith('special-melee');
    });
  });

  describe('onStepAdded モード（登録モード）', () => {
    it('ボタン押下で onStepAdded が CommandStep として呼ばれる', () => {
      const onStepAdded = vi.fn();
      render(<ArcadeController onStepAdded={onStepAdded} />);
      fireEvent.pointerDown(screen.getByText('ジャンプ'));
      expect(onStepAdded).toHaveBeenCalledWith({ buttons: ['jump'] });
    });

    it('サブ同時押しで onStepAdded が { buttons: ["sub"] } で呼ばれる', () => {
      const onStepAdded = vi.fn();
      render(<ArcadeController onStepAdded={onStepAdded} />);
      const shot = screen.getByText('射撃').closest('button')!;
      const melee = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(shot, { pointerId: 1 });
      fireEvent.pointerDown(melee, { pointerId: 2 });
      expect(onStepAdded).toHaveBeenCalledWith({ buttons: ['sub'] });
    });

    it('格闘を短押しで onStepAdded が { buttons: ["melee"] } で呼ばれる', () => {
      const onStepAdded = vi.fn();
      render(<ArcadeController onStepAdded={onStepAdded} />);
      const el = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(el, { pointerId: 1 });
      fireEvent.pointerUp(el, { pointerId: 1 });
      expect(onStepAdded).toHaveBeenCalledWith({ buttons: ['melee'] });
    });

    it('onButtonPress と onStepAdded の両方が渡された場合、onButtonPress が優先される', () => {
      const onButtonPress = vi.fn();
      const onStepAdded = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} onStepAdded={onStepAdded} />);
      fireEvent.pointerDown(screen.getByText('ジャンプ'));
      expect(onButtonPress).toHaveBeenCalledWith('jump');
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
      screen.getAllByRole('button').forEach((btn) => {
        expect(btn.getAttribute('data-highlighted')).toBeNull();
      });
    });
  });

  describe('activeButtons（押下中スタイル）', () => {
    it('射撃ボタン押下中は aria-pressed が true になる', () => {
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

    it('格闘保持中は aria-pressed が true になる', () => {
      render(<ArcadeController />);
      const meleeEl = screen.getByText('格闘').closest('button')!;
      act(() => {
        fireEvent.pointerDown(meleeEl, { pointerId: 2 });
      });
      expect(meleeEl.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('チャージ検出（useChargeInput 統合）', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('格闘を長押し（しきい値以上）して離すと onButtonPress が melee-charge で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const el = screen.getByText('格闘').closest('button')!;
      const start = Date.now();
      act(() => {
        fireEvent.pointerDown(el, { pointerId: 1 });
      });
      vi.setSystemTime(start + CHARGE_THRESHOLD_MS + 50);
      act(() => {
        fireEvent.pointerUp(el, { pointerId: 1 });
      });
      expect(onButtonPress).toHaveBeenCalledWith('melee-charge');
    });

    it('onStepAdded で射撃を長押しすると shot-charge が記録される', () => {
      const onStepAdded = vi.fn();
      render(<ArcadeController onStepAdded={onStepAdded} />);
      const el = screen.getByText('射撃').closest('button')!;
      const start = Date.now();
      act(() => {
        fireEvent.pointerDown(el, { pointerId: 3 });
      });
      vi.setSystemTime(start + CHARGE_THRESHOLD_MS + 1);
      act(() => {
        fireEvent.pointerUp(el, { pointerId: 3 });
      });
      expect(onStepAdded).toHaveBeenCalledWith({ buttons: ['shot-charge'] });
    });

    it('sub 発火後は個別の pointerUp で shot/melee がコールバックされない', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const shot = screen.getByText('射撃').closest('button')!;
      const melee = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(shot, { pointerId: 1 });
      fireEvent.pointerDown(melee, { pointerId: 2 });
      onButtonPress.mockClear();
      fireEvent.pointerUp(shot, { pointerId: 1 });
      fireEvent.pointerUp(melee, { pointerId: 2 });
      expect(onButtonPress).not.toHaveBeenCalled();
    });
  });
});
