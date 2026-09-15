import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalibrationOverlay } from '@/features/chart-author/calibration/CalibrationOverlay';
import type { OverlayRect } from '@/features/chart-author/calibration/useCalibrationDraw';

/** 動画の表示サイズ。正規化座標への換算はこの箱を基準にする */
const STAGE = { left: 0, top: 0, width: 800, height: 450 };

let onDraw: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onDraw = vi.fn();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...STAGE,
    right: STAGE.width,
    bottom: STAGE.height,
    x: STAGE.left,
    y: STAGE.top,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderOverlay(props: Partial<React.ComponentProps<typeof CalibrationOverlay>> = {}) {
  return render(
    <CalibrationOverlay
      rects={[]}
      activeLabel="ブーストゲージ"
      disabled={false}
      onDraw={onDraw}
      {...props}
    />,
  );
}

/** 表示座標でのドラッグを再現する */
function drag(from: readonly [number, number], to: readonly [number, number]): void {
  const layer = screen.getByTestId('calibration-overlay');
  fireEvent.mouseDown(layer, { clientX: from[0], clientY: from[1] });
  fireEvent.mouseMove(window, { clientX: to[0], clientY: to[1] });
  fireEvent.mouseUp(window, { clientX: to[0], clientY: to[1] });
}

describe('CalibrationOverlay', () => {
  it('ドラッグした矩形を解像度非依存の座標へ変換して渡す', () => {
    renderOverlay();

    drag([80, 45], [240, 135]);

    expect(onDraw).toHaveBeenCalledTimes(1);
    const rect = onDraw.mock.calls[0][0];
    expect(rect.x).toBeCloseTo(0.1, 5);
    expect(rect.y).toBeCloseTo(0.1, 5);
    expect(rect.width).toBeCloseTo(0.2, 5);
    expect(rect.height).toBeCloseTo(0.2, 5);
  });

  it('右下から左上へ引いても同じ矩形になる', () => {
    renderOverlay();

    drag([240, 135], [80, 45]);

    const rect = onDraw.mock.calls[0][0];
    expect(rect.x).toBeCloseTo(0.1, 5);
    expect(rect.width).toBeCloseTo(0.2, 5);
  });

  it('動画の外へはみ出した分は内側へ収める', () => {
    renderOverlay();

    drag([-100, -100], [1600, 900]);

    const rect = onDraw.mock.calls[0][0];
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(1);
    expect(rect.height).toBe(1);
  });

  it('広がりのないドラッグは矩形として扱わない', () => {
    renderOverlay();

    drag([100, 100], [101, 101]);

    expect(onDraw).not.toHaveBeenCalled();
  });

  it('いま何を描いているかを示す', () => {
    renderOverlay({ activeLabel: '新しいスロットの弾数領域' });

    expect(screen.getByTestId('calibration-overlay').textContent).toContain(
      '新しいスロットの弾数領域',
    );
  });

  it('描き終えた矩形をラベルつきで重ねる', () => {
    const rects: readonly OverlayRect[] = [
      {
        id: 'r1',
        label: 'スロット 1 弾数',
        variant: 'ammo',
        rect: { x: 0.5, y: 0.25, width: 0.1, height: 0.05 },
      },
      {
        id: 'r2',
        label: 'ブースト',
        variant: 'boost',
        rect: { x: 0.2, y: 0.9, width: 0.6, height: 0.02 },
      },
    ];
    renderOverlay({ rects });

    expect(screen.getAllByTestId('calibration-rect')).toHaveLength(2);
    expect(screen.getByText('スロット 1 弾数')).toBeDefined();
    const [first] = screen.getAllByTestId('calibration-rect');
    expect(first.getAttribute('style')).toContain('50%');
  });

  it('無効な間はドラッグを受け付けない', () => {
    renderOverlay({ disabled: true });

    drag([80, 45], [240, 135]);

    expect(onDraw).not.toHaveBeenCalled();
  });
});
