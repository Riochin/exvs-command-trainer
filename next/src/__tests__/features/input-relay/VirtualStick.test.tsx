import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { stickDirections, stickTapDirection, VirtualStick } from '@/features/input-relay/VirtualStick';

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

describe('stickTapDirection', () => {
  it.each([
    [0, 1, 'forward'],
    [0, -1, 'back'],
    [1, 0, 'right'],
    [-1, 0, 'left'],
    // 斜めでも、上寄りなら上、右寄りなら右（判定しない区間はない）
    [0.6, 0.7, 'forward'],
    [0.7, 0.6, 'right'],
    [-0.5, -0.8, 'back'],
  ] as const)('(%s, %s) → %s', (x, y, expected) => {
    expect(stickTapDirection(x, y)).toBe(expected);
  });

  it('小さく傾けただけなら数えない', () => {
    expect(stickTapDirection(0.1, 0.2)).toBeNull();
  });
});

describe('VirtualStick', () => {
  function setup() {
    const onLever = vi.fn();
    const onTap = vi.fn();
    render(<VirtualStick onLever={onLever} onTap={onTap} />);
    const base = screen.getByTestId('virtual-stick');
    // 100x100 の台として扱う
    base.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    return { onLever, onTap, base };
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

  it('斜めにぶれても、上寄りに 2 回弾けば上を 2 回倒したと通知する', () => {
    const { onLever, onTap, base } = setup();
    // 1 回目は真上、2 回目は斜め右上（ぎりぎり上寄り）
    fireEvent.pointerDown(base, { pointerId: 1, clientX: 50, clientY: 0 });
    fireEvent.pointerUp(base, { pointerId: 1, clientX: 50, clientY: 0 });
    fireEvent.pointerDown(base, { pointerId: 1, clientX: 85, clientY: 10 });
    fireEvent.pointerUp(base, { pointerId: 1, clientX: 85, clientY: 10 });
    expect(onTap.mock.calls).toEqual([['forward'], ['forward']]);
    // 移動は斜め（上＋右）のまま
    expect(onLever.mock.calls).toContainEqual(['right', true]);
  });

  it('倒したまま受け持ちの方向が変わったときだけ、もう 1 回倒したと通知する', () => {
    const { onTap, base } = setup();
    fireEvent.pointerDown(base, { pointerId: 1, clientX: 50, clientY: 0 });
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 55, clientY: 5 });
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 100, clientY: 50 });
    expect(onTap.mock.calls).toEqual([['forward'], ['right']]);
  });

  it('台の 4 分の 1 ほど傾けただけで倒したことになる', () => {
    const { onLever, onTap, base } = setup();
    // 中心 (50, 50) から上へ 15px（半径比 0.3）
    fireEvent.pointerDown(base, { pointerId: 1, clientX: 50, clientY: 35 });
    expect(onLever.mock.calls).toEqual([['forward', true]]);
    expect(onTap.mock.calls).toEqual([['forward']]);
  });

  it('倒す境目のあたりで指が震えても、中立には戻らず 2 回弾いた扱いにしない', () => {
    const { onLever, onTap, base } = setup();
    fireEvent.pointerDown(base, { pointerId: 1, clientX: 50, clientY: 35 }); // 0.3
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 50, clientY: 40 }); // 0.2
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 50, clientY: 37 }); // 0.26
    expect(onLever.mock.calls).toEqual([['forward', true]]);
    expect(onTap.mock.calls).toEqual([['forward']]);

    // はっきり戻せば中立になり、もう一度倒せば 2 回目として数える
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 50, clientY: 46 }); // 0.08
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 50, clientY: 40 }); // 0.2: まだ倒していない
    expect(onTap.mock.calls).toEqual([['forward']]);
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 50, clientY: 35 }); // 0.3
    expect(onLever.mock.calls).toEqual([
      ['forward', true],
      ['forward', false],
      ['forward', true],
    ]);
    expect(onTap.mock.calls).toEqual([['forward'], ['forward']]);
  });

  it('倒したまま斜めで震えても、上下左右の受け持ちは少し越えただけでは変えない', () => {
    const { onTap, base } = setup();
    fireEvent.pointerDown(base, { pointerId: 1, clientX: 65, clientY: 20 }); // (0.3, 0.6): 上
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 77.5, clientY: 25 }); // (0.55, 0.5): 右がわずかに大きい
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 65, clientY: 20 });
    expect(onTap.mock.calls).toEqual([['forward']]);
    fireEvent.pointerMove(base, { pointerId: 1, clientX: 85, clientY: 30 }); // (0.7, 0.4): はっきり右
    expect(onTap.mock.calls).toEqual([['forward'], ['right']]);
  });
});
