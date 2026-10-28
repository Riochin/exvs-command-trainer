import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { stickDirections, VirtualStick } from '@/features/input-relay/VirtualStick';

describe('stickDirections', () => {
  it.each([
    [0, 1, ['forward']],
    [0, -1, ['back']],
    [1, 0, ['right']],
    [-1, 0, ['left']],
    [0.7, 0.7, ['forward', 'right']],
    [-0.7, -0.7, ['back', 'left']],
  ] as const)('(%s, %s) → %j', (x, y, expected) => {
    expect(stickDirections(x, y)).toEqual(expected);
  });

  it('小さく傾けただけなら中立', () => {
    expect(stickDirections(0.1, 0.2)).toEqual([]);
  });
});

describe('VirtualStick', () => {
  function setup() {
    const onLever = vi.fn();
    render(<VirtualStick onLever={onLever} />);
    const base = screen.getByTestId('virtual-stick');
    // 100x100 の台として扱う
    base.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    return { onLever, base };
  }

  it('倒した方向を押し、方向が変わったら差分だけ通知し、離すと全部戻す', () => {
    const { onLever, base } = setup();
    fireEvent.pointerDown(base, { pointerId: 1, clientX: 50, clientY: 0 });
    expect(onLever.mock.calls).toEqual([['forward', true]]);

    fireEvent.pointerMove(base, { pointerId: 1, clientX: 100, clientY: 0 });
    expect(onLever.mock.calls.slice(1)).toEqual([['right', true]]);

    fireEvent.pointerUp(base, { pointerId: 1, clientX: 100, clientY: 0 });
    expect(onLever.mock.calls.slice(2)).toEqual([
      ['forward', false],
      ['right', false],
    ]);
  });

  it('別の指の動きは無視する', () => {
    const { onLever, base } = setup();
    fireEvent.pointerDown(base, { pointerId: 1, clientX: 0, clientY: 50 });
    fireEvent.pointerMove(base, { pointerId: 2, clientX: 100, clientY: 50 });
    expect(onLever.mock.calls).toEqual([['left', true]]);
  });
});
