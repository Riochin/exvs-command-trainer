import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransportBar } from '@/features/chart-author/player/TransportBar';
import { FRAME_STEP_KEYS } from '@/features/chart-author/player/TransportBar';

type Handlers = {
  onPlay: ReturnType<typeof vi.fn>;
  onPause: ReturnType<typeof vi.fn>;
  onSeek: ReturnType<typeof vi.fn>;
  onStepFrame: ReturnType<typeof vi.fn>;
};

let handlers: Handlers;

beforeEach(() => {
  handlers = {
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onSeek: vi.fn(),
    onStepFrame: vi.fn(),
  };
});

function renderBar(props: Partial<React.ComponentProps<typeof TransportBar>> = {}) {
  return render(
    <TransportBar
      currentTimeMs={0}
      durationMs={60_000}
      isPlaying={false}
      disabled={false}
      {...handlers}
      {...props}
    />,
  );
}

describe('TransportBar - 時刻表示', () => {
  it('現在の再生位置を mm:ss.mmm の形式で常時表示する', () => {
    renderBar({ currentTimeMs: 65_432 });

    expect(screen.getByTestId('transport-timecode').textContent).toBe('01:05.432');
  });

  it('再生位置が変われば表示も変わる', () => {
    const { rerender } = renderBar({ currentTimeMs: 0 });
    expect(screen.getByTestId('transport-timecode').textContent).toBe('00:00.000');

    rerender(
      <TransportBar
        currentTimeMs={1_500}
        durationMs={60_000}
        isPlaying={false}
        disabled={false}
        {...handlers}
      />,
    );

    expect(screen.getByTestId('transport-timecode').textContent).toBe('00:01.500');
  });
});

describe('TransportBar - 操作', () => {
  it('再生を押すと再生を要求する', () => {
    renderBar({ isPlaying: false });

    fireEvent.click(screen.getByRole('button', { name: '再生' }));

    expect(handlers.onPlay).toHaveBeenCalledTimes(1);
  });

  it('再生中は一時停止の操作になる', () => {
    renderBar({ isPlaying: true });

    fireEvent.click(screen.getByRole('button', { name: '一時停止' }));

    expect(handlers.onPause).toHaveBeenCalledTimes(1);
  });

  it('コマ送りを前後に要求できる', () => {
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: '1 コマ進む' }));
    fireEvent.click(screen.getByRole('button', { name: '1 コマ戻る' }));

    expect(handlers.onStepFrame).toHaveBeenNthCalledWith(1, 1);
    expect(handlers.onStepFrame).toHaveBeenNthCalledWith(2, -1);
  });

  it('ミリ秒単位でシークできる', () => {
    renderBar({ durationMs: 60_000 });

    const slider = screen.getByRole('slider', { name: '再生位置' });
    expect(slider.getAttribute('max')).toBe('60000');
    expect(slider.getAttribute('step')).toBe('1');

    fireEvent.change(slider, { target: { value: '12345' } });

    expect(handlers.onSeek).toHaveBeenCalledWith(12_345);
  });

  it('動画が読み込まれていなければ操作できない', () => {
    renderBar({ disabled: true });

    expect(screen.getByRole('button', { name: '再生' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('slider', { name: '再生位置' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('TransportBar - キーボードショートカット', () => {
  it('割り当てるキーがアーケードコントローラのデバッグキーと衝突しない', () => {
    // ArcadeController は f / y / i を握っている
    expect(Object.keys(FRAME_STEP_KEYS)).not.toContain('f');
    expect(Object.keys(FRAME_STEP_KEYS)).not.toContain('y');
    expect(Object.keys(FRAME_STEP_KEYS)).not.toContain('i');
  });

  it('コマ送りをキーボードから行える', () => {
    renderBar();

    fireEvent.keyDown(window, { key: '.' });
    fireEvent.keyDown(window, { key: ',' });

    expect(handlers.onStepFrame).toHaveBeenNthCalledWith(1, 1);
    expect(handlers.onStepFrame).toHaveBeenNthCalledWith(2, -1);
  });

  it('アーケードコントローラのデバッグキーには反応しない', () => {
    renderBar();

    for (const key of ['f', 'y', 'i']) fireEvent.keyDown(window, { key });

    expect(handlers.onStepFrame).not.toHaveBeenCalled();
    expect(handlers.onPlay).not.toHaveBeenCalled();
  });

  it('スペースで再生と一時停止を切り替える', () => {
    const { rerender } = renderBar({ isPlaying: false });
    fireEvent.keyDown(window, { key: ' ' });
    expect(handlers.onPlay).toHaveBeenCalledTimes(1);

    rerender(
      <TransportBar
        currentTimeMs={0}
        durationMs={60_000}
        isPlaying
        disabled={false}
        {...handlers}
      />,
    );
    fireEvent.keyDown(window, { key: ' ' });
    expect(handlers.onPause).toHaveBeenCalledTimes(1);
  });

  it('文字入力中のキーは奪わない', () => {
    renderBar();
    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: '.' });

    expect(handlers.onStepFrame).not.toHaveBeenCalled();
    input.remove();
  });

  it('動画が読み込まれていなければキーボードにも反応しない', () => {
    renderBar({ disabled: true });

    fireEvent.keyDown(window, { key: '.' });
    fireEvent.keyDown(window, { key: ' ' });

    expect(handlers.onStepFrame).not.toHaveBeenCalled();
    expect(handlers.onPlay).not.toHaveBeenCalled();
  });
});
