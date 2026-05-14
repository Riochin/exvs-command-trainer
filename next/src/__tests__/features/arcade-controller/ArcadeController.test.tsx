import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArcadeController, SIMULTANEOUS_INPUT_DEFER_MS, BD_WINDOW_MS } from '@/features/arcade-controller/ArcadeController';
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
      vi.useFakeTimers();
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const el = screen.getByText('射撃').closest('button')!;
      fireEvent.pointerDown(el, { pointerId: 1 });
      fireEvent.pointerUp(el, { pointerId: 1 });
      act(() => {
        vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
      });
      expect(onButtonPress).toHaveBeenCalledWith('shot');
      vi.useRealTimers();
    });

    it('格闘を短押しで onButtonPress が "melee" で呼ばれる', () => {
      vi.useFakeTimers();
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const el = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(el, { pointerId: 1 });
      fireEvent.pointerUp(el, { pointerId: 1 });
      act(() => {
        vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
      });
      expect(onButtonPress).toHaveBeenCalledWith('melee');
      vi.useRealTimers();
    });

    it('ジャンプのタップで onButtonPress が "jump" で呼ばれる', () => {
      vi.useFakeTimers();
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;
      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });
      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 10); });
      expect(onButtonPress).toHaveBeenCalledWith('jump');
      vi.useRealTimers();
    });

    it('ジャンプ→格闘の順でも onButtonPress は "special-melee" のみ（先行ジャンプ誤検知しない）', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const melee = screen.getByText('格闘').closest('button')!;
      const jump = screen.getByText('ジャンプ').closest('button')!;
      fireEvent.pointerDown(jump, { pointerId: 2 });
      fireEvent.pointerDown(melee, { pointerId: 1 });
      expect(onButtonPress).toHaveBeenCalledTimes(1);
      expect(onButtonPress).toHaveBeenCalledWith('special-melee');
      expect(onButtonPress).not.toHaveBeenCalledWith('jump');
    });

    it('ジャンプ→射撃の順でも onButtonPress は "special-shot" のみ（先行ジャンプ誤検知しない）', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const shot = screen.getByText('射撃').closest('button')!;
      const jump = screen.getByText('ジャンプ').closest('button')!;
      fireEvent.pointerDown(jump, { pointerId: 2 });
      fireEvent.pointerDown(shot, { pointerId: 1 });
      expect(onButtonPress).toHaveBeenCalledTimes(1);
      expect(onButtonPress).toHaveBeenCalledWith('special-shot');
      expect(onButtonPress).not.toHaveBeenCalledWith('jump');
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

    it('射撃を離した直後に格闘を押すと遅延中の shot は発火しない', () => {
      vi.useFakeTimers();
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const shot = screen.getByText('射撃').closest('button')!;
      const melee = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(shot, { pointerId: 1 });
      fireEvent.pointerUp(shot, { pointerId: 1 });
      fireEvent.pointerDown(melee, { pointerId: 2 });
      act(() => {
        vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS + 20);
      });
      expect(onButtonPress).not.toHaveBeenCalledWith('shot');
      vi.useRealTimers();
    });

    describe('keyboard debug (f / y / i)', () => {
      it('f の keyDown→keyUp で onButtonPress が "shot" で呼ばれる', () => {
        vi.useFakeTimers();
        const onButtonPress = vi.fn();
        render(<ArcadeController onButtonPress={onButtonPress} />);
        fireEvent.keyDown(window, { key: 'f' });
        fireEvent.keyUp(window, { key: 'f' });
        act(() => {
          vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
        });
        expect(onButtonPress).toHaveBeenCalledWith('shot');
        vi.useRealTimers();
      });

      it('y の keyDown→keyUp で onButtonPress が "melee" で呼ばれる', () => {
        vi.useFakeTimers();
        const onButtonPress = vi.fn();
        render(<ArcadeController onButtonPress={onButtonPress} />);
        fireEvent.keyDown(window, { key: 'y' });
        fireEvent.keyUp(window, { key: 'y' });
        act(() => {
          vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
        });
        expect(onButtonPress).toHaveBeenCalledWith('melee');
        vi.useRealTimers();
      });

      it('i の keyDown→keyUp で onButtonPress が "jump" で1回だけ呼ばれる', () => {
        vi.useFakeTimers();
        const onButtonPress = vi.fn();
        render(<ArcadeController onButtonPress={onButtonPress} />);
        fireEvent.keyDown(window, { key: 'i' });
        fireEvent.keyUp(window, { key: 'i' });
        act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 10); });
        expect(onButtonPress).toHaveBeenCalledTimes(1);
        expect(onButtonPress).toHaveBeenCalledWith('jump');
        vi.useRealTimers();
      });

      it('大文字 F でも射撃として扱う', () => {
        vi.useFakeTimers();
        const onButtonPress = vi.fn();
        render(<ArcadeController onButtonPress={onButtonPress} />);
        fireEvent.keyDown(window, { key: 'F' });
        fireEvent.keyUp(window, { key: 'F' });
        act(() => {
          vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
        });
        expect(onButtonPress).toHaveBeenCalledWith('shot');
        vi.useRealTimers();
      });
    });
  });

  describe('onStepAdded モード（登録モード）', () => {
    it('ボタン押下で onStepAdded が CommandStep として呼ばれる', () => {
      vi.useFakeTimers();
      const onStepAdded = vi.fn();
      render(<ArcadeController onStepAdded={onStepAdded} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;
      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });
      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 10); });
      expect(onStepAdded).toHaveBeenCalledWith({ buttons: ['jump'] });
      vi.useRealTimers();
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
      vi.useFakeTimers();
      const onStepAdded = vi.fn();
      render(<ArcadeController onStepAdded={onStepAdded} />);
      const el = screen.getByText('格闘').closest('button')!;
      fireEvent.pointerDown(el, { pointerId: 1 });
      fireEvent.pointerUp(el, { pointerId: 1 });
      act(() => {
        vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
      });
      expect(onStepAdded).toHaveBeenCalledWith({ buttons: ['melee'] });
      vi.useRealTimers();
    });

    it('onButtonPress と onStepAdded の両方が渡された場合、onButtonPress が優先される', () => {
      vi.useFakeTimers();
      const onButtonPress = vi.fn();
      const onStepAdded = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} onStepAdded={onStepAdded} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;
      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });
      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 10); });
      expect(onButtonPress).toHaveBeenCalledWith('jump');
      expect(onStepAdded).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('highlightedButton / highlightedPhysicalButtons', () => {
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

    it('highlightedPhysicalButtons で複数ボタンに data-highlighted が付く', () => {
      render(<ArcadeController highlightedPhysicalButtons={['shot', 'melee']} />);
      expect(screen.getByText('射撃').closest('button')?.getAttribute('data-highlighted')).toBe('true');
      expect(screen.getByText('格闘').closest('button')?.getAttribute('data-highlighted')).toBe('true');
      expect(screen.getByText('ジャンプ').closest('button')?.getAttribute('data-highlighted')).toBeNull();
    });

    it('highlightedPhysicalButtons が優先され highlightedButton は無視される', () => {
      render(<ArcadeController highlightedButton="jump" highlightedPhysicalButtons={['shot']} />);
      expect(screen.getByText('射撃').closest('button')?.getAttribute('data-highlighted')).toBe('true');
      expect(screen.getByText('ジャンプ').closest('button')?.getAttribute('data-highlighted')).toBeNull();
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

  describe('BD（ブーストダッシュ）検出', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('BD_WINDOW_MS 以内の2連打で "bd" が発火する', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });

      act(() => { vi.advanceTimersByTime(100); }); // BD_WINDOW_MS より短い (200ms)

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });

      expect(onButtonPress).toHaveBeenCalledWith('bd');
    });

    it('BD_WINDOW_MS 以内の2連打では "jump" は発火しない', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });

      act(() => { vi.advanceTimersByTime(100); });

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });

      expect(onButtonPress).not.toHaveBeenCalledWith('jump');
    });

    it('単押し後に BD_WINDOW_MS が経過すると "jump" が発火する', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });

      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS - 10); });
      expect(onButtonPress).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(20); }); // 合計 > BD_WINDOW_MS
      expect(onButtonPress).toHaveBeenCalledWith('jump');
    });

    it('単押しでは "bd" は発火しない', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });

      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 50); });

      expect(onButtonPress).not.toHaveBeenCalledWith('bd');
    });

    it('BD_WINDOW_MS を超えた間隔の2連打では "jump" が2回発火する', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });
      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 50); }); // 1回目 jump 確定

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });
      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 50); }); // 2回目 jump 確定

      expect(onButtonPress).toHaveBeenCalledTimes(2);
      expect(onButtonPress).toHaveBeenCalledWith('jump');
    });

    it('BD_WINDOW_MS を超えた間隔の2連打では "bd" は発火しない', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const jump = screen.getByText('ジャンプ').closest('button')!;

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });
      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 50); });

      fireEvent.pointerDown(jump, { pointerId: 1 });
      fireEvent.pointerUp(jump, { pointerId: 1 });
      act(() => { vi.advanceTimersByTime(BD_WINDOW_MS + 50); });

      expect(onButtonPress).not.toHaveBeenCalledWith('bd');
    });
  });

  describe('チャージ検出（useChargeInput 統合）', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('格闘を長押し（しきい値以上）して離すと melee-charge-start → melee-charge-end で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const el = screen.getByText('格闘').closest('button')!;
      act(() => {
        fireEvent.pointerDown(el, { pointerId: 1 });
      });
      act(() => { vi.advanceTimersByTime(CHARGE_THRESHOLD_MS); }); // タイマー発火 → melee-charge-start
      act(() => {
        fireEvent.pointerUp(el, { pointerId: 1 }); // → melee-charge-end
      });
      expect(onButtonPress).toHaveBeenCalledTimes(2);
      expect(onButtonPress).toHaveBeenNthCalledWith(1, 'melee-charge-start');
      expect(onButtonPress).toHaveBeenNthCalledWith(2, 'melee-charge-end');
    });

    it('格闘を短押し（しきい値未満）して離すと onButtonPress が melee で呼ばれる', () => {
      const onButtonPress = vi.fn();
      render(<ArcadeController onButtonPress={onButtonPress} />);
      const el = screen.getByText('格闘').closest('button')!;
      const start = Date.now();
      act(() => {
        fireEvent.pointerDown(el, { pointerId: 1 });
      });
      vi.setSystemTime(start + CHARGE_THRESHOLD_MS - 1);
      act(() => {
        fireEvent.pointerUp(el, { pointerId: 1 });
        vi.advanceTimersByTime(SIMULTANEOUS_INPUT_DEFER_MS);
      });
      expect(onButtonPress).toHaveBeenCalledWith('melee');
    });

    it('格闘保持中、しきい値経過後も離すまで aria-pressed が true', () => {
      render(<ArcadeController />);
      const el = screen.getByText('格闘').closest('button')!;
      const start = Date.now();
      act(() => {
        fireEvent.pointerDown(el, { pointerId: 1 });
      });
      expect(el.getAttribute('aria-pressed')).toBe('true');
      act(() => {
        vi.setSystemTime(start + CHARGE_THRESHOLD_MS + 100);
      });
      expect(el.getAttribute('aria-pressed')).toBe('true');
    });

    it('onStepAdded で射撃を長押しすると shot-charge-start と shot-charge-end が別々のステップとして記録される', () => {
      const onStepAdded = vi.fn();
      render(<ArcadeController onStepAdded={onStepAdded} />);
      const el = screen.getByText('射撃').closest('button')!;
      act(() => {
        fireEvent.pointerDown(el, { pointerId: 3 });
      });
      act(() => { vi.advanceTimersByTime(CHARGE_THRESHOLD_MS); }); // → shot-charge-start
      act(() => {
        fireEvent.pointerUp(el, { pointerId: 3 }); // → shot-charge-end
      });
      expect(onStepAdded).toHaveBeenCalledTimes(2);
      expect(onStepAdded).toHaveBeenNthCalledWith(1, { buttons: ['shot-charge-start'] });
      expect(onStepAdded).toHaveBeenNthCalledWith(2, { buttons: ['shot-charge-end'] });
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
