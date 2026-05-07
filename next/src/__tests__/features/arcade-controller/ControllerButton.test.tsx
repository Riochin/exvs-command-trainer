import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ControllerButton } from '@/features/arcade-controller/ControllerButton';
import type { ButtonType } from '@/types';
import type { PointerHandlers } from '@/hooks/useControllerInput';

function makeHandlers(overrides: Partial<PointerHandlers> = {}): PointerHandlers {
  return {
    onPointerDown: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
    ...overrides,
  };
}

describe('ControllerButton', () => {
  it.each<[ButtonType, string]>([
    ['shot', '射撃'],
    ['melee', '格闘'],
    ['jump', 'ジャンプ'],
    ['awaken', '覚醒'],
  ])('%s ボタンに日本語ラベル "%s" が表示される', (button, label) => {
    render(
      <ControllerButton
        button={button}
        isActive={false}
        handlers={makeHandlers()}
      />
    );
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('isActive=true のとき aria-pressed が true', () => {
    render(
      <ControllerButton button="shot" isActive={true} handlers={makeHandlers()} />
    );
    const el = screen.getByRole('button');
    expect(el.getAttribute('aria-pressed')).toBe('true');
  });

  it('isActive=false のとき aria-pressed が false', () => {
    render(
      <ControllerButton button="shot" isActive={false} handlers={makeHandlers()} />
    );
    const el = screen.getByRole('button');
    expect(el.getAttribute('aria-pressed')).toBe('false');
  });

  it('highlighted=true のとき data-highlighted 属性が設定される', () => {
    render(
      <ControllerButton button="shot" isActive={false} highlighted={true} handlers={makeHandlers()} />
    );
    const el = screen.getByRole('button');
    expect(el.getAttribute('data-highlighted')).toBe('true');
  });

  it('highlighted=false（未指定）のとき data-highlighted 属性がない', () => {
    render(
      <ControllerButton button="shot" isActive={false} handlers={makeHandlers()} />
    );
    const el = screen.getByRole('button');
    expect(el.getAttribute('data-highlighted')).toBeNull();
  });

  it('state="success" のとき data-state="success" 属性が設定される', () => {
    render(
      <ControllerButton button="shot" isActive={false} state="success" handlers={makeHandlers()} />
    );
    const el = screen.getByRole('button');
    expect(el.getAttribute('data-state')).toBe('success');
  });

  it('state="fail" のとき data-state="fail" 属性が設定される', () => {
    render(
      <ControllerButton button="shot" isActive={false} state="fail" handlers={makeHandlers()} />
    );
    const el = screen.getByRole('button');
    expect(el.getAttribute('data-state')).toBe('fail');
  });

  it('state="neutral" のとき data-state="neutral" 属性が設定される', () => {
    render(
      <ControllerButton button="shot" isActive={false} state="neutral" handlers={makeHandlers()} />
    );
    const el = screen.getByRole('button');
    expect(el.getAttribute('data-state')).toBe('neutral');
  });

  it('state 未指定のとき data-state 属性がない', () => {
    render(
      <ControllerButton button="shot" isActive={false} handlers={makeHandlers()} />
    );
    const el = screen.getByRole('button');
    expect(el.getAttribute('data-state')).toBeNull();
  });

  it('pointerdown イベントで onPointerDown ハンドラが呼ばれる', () => {
    const onPointerDown = vi.fn();
    render(
      <ControllerButton
        button="shot"
        isActive={false}
        handlers={makeHandlers({ onPointerDown })}
      />
    );
    fireEvent.pointerDown(screen.getByRole('button'));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('pointerup イベントで onPointerUp ハンドラが呼ばれる', () => {
    const onPointerUp = vi.fn();
    render(
      <ControllerButton
        button="shot"
        isActive={false}
        handlers={makeHandlers({ onPointerUp })}
      />
    );
    fireEvent.pointerUp(screen.getByRole('button'));
    expect(onPointerUp).toHaveBeenCalledTimes(1);
  });

  it('pointercancel イベントで onPointerCancel ハンドラが呼ばれる', () => {
    const onPointerCancel = vi.fn();
    render(
      <ControllerButton
        button="shot"
        isActive={false}
        handlers={makeHandlers({ onPointerCancel })}
      />
    );
    fireEvent.pointerCancel(screen.getByRole('button'));
    expect(onPointerCancel).toHaveBeenCalledTimes(1);
  });
});
