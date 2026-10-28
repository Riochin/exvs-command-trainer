import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timeline } from '@/features/chart-author/editor/Timeline';
import type { EditorStep } from '@/features/chart-author/types';

function step(patch: Partial<EditorStep> & { id: string; tMs: number }): EditorStep {
  return {
    input: 'shot',
    confidence: 0.9,
    origin: 'auto',
    detector: 'ammo',
    caveat: 'none',
    ...patch,
  };
}

const STEPS: readonly EditorStep[] = [
  step({ id: 'a', tMs: 0 }),
  step({ id: 'b', tMs: 30_000 }),
  step({ id: 'c', tMs: 45_000, input: 'bd', detector: 'boost', confidence: 0.4 }),
];

let onSelect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onSelect = vi.fn();
});

function renderTimeline(props: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  const merged: React.ComponentProps<typeof Timeline> = {
    steps: STEPS,
    durationMs: 60_000,
    currentTimeMs: 0,
    selectedId: null,
    onSelect,
    ...props,
  };
  const view = render(<Timeline {...merged} />);
  return {
    ...view,
    rerenderWith: (next: Partial<React.ComponentProps<typeof Timeline>>) =>
      view.rerender(<Timeline {...merged} {...next} />),
  };
}

function markers(): HTMLElement[] {
  return screen.getAllByTestId('timeline-marker');
}

describe('Timeline - マーカー', () => {
  it('ステップ数と同数のマーカーを描く', () => {
    renderTimeline();

    expect(markers()).toHaveLength(STEPS.length);
  });

  it('尺に比例した位置にマーカーを置く', () => {
    renderTimeline();

    expect(markers().map((marker) => marker.style.left)).toEqual(['0%', '50%', '75%']);
  });

  it('尺を超える時刻のマーカーは右端に留める', () => {
    renderTimeline({ steps: [step({ id: 'over', tMs: 90_000 })] });

    expect(markers()[0].style.left).toBe('100%');
  });

  it('尺が未取得でも描画を壊さない', () => {
    renderTimeline({ durationMs: 0 });

    expect(markers().map((marker) => marker.style.left)).toEqual(['0%', '0%', '0%']);
  });

  it('ステップが 1 件もなければマーカーを描かない', () => {
    renderTimeline({ steps: [] });

    expect(screen.queryAllByTestId('timeline-marker')).toHaveLength(0);
    expect(screen.getByTestId('timeline')).toBeTruthy();
  });
});

describe('Timeline - 確認待ちの候補', () => {
  it('ブースト由来のマーカーを候補として区別する', () => {
    renderTimeline();

    expect(markers().map((marker) => marker.dataset.candidate)).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('確認を要する理由が付いたマーカーも候補として区別する', () => {
    renderTimeline({
      steps: [step({ id: 'x', tMs: 1_000, detector: 'ammo', caveat: 'low_margin' })],
    });

    expect(markers()[0].dataset.candidate).toBe('true');
  });
});

describe('Timeline - 再生位置', () => {
  it('現在の再生位置を示す指標を重ねる', () => {
    renderTimeline({ currentTimeMs: 15_000 });

    expect(screen.getByTestId('timeline-playhead').style.left).toBe('25%');
  });

  it('再生が進むと指標も追随する', () => {
    const { rerenderWith } = renderTimeline({ currentTimeMs: 0 });
    expect(screen.getByTestId('timeline-playhead').style.left).toBe('0%');

    rerenderWith({ currentTimeMs: 30_000 });

    expect(screen.getByTestId('timeline-playhead').style.left).toBe('50%');
  });

  it('再生位置が尺を超えても指標は右端に留まる', () => {
    renderTimeline({ currentTimeMs: 120_000 });

    expect(screen.getByTestId('timeline-playhead').style.left).toBe('100%');
  });
});

describe('Timeline - 選択', () => {
  it('マーカーを押すとその id で選択を要求する', () => {
    renderTimeline();

    fireEvent.click(markers()[1]);

    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('選択中のマーカーに印を付ける', () => {
    renderTimeline({ selectedId: 'c' });

    expect(markers().map((marker) => marker.dataset.selected)).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('マーカーには時刻と種別が分かる名前を付ける', () => {
    renderTimeline();

    expect(markers()[1].getAttribute('aria-label')).toContain('00:30.000');
    expect(markers()[1].getAttribute('aria-label')).toContain('射撃');
  });
});
