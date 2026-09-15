import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StepList } from '@/features/chart-author/editor/StepList';
import { DEFAULT_STEP_FILTER } from '@/features/chart-author/editor/useChartEditor';
import { INPUT_TYPES } from '@/features/chart-author/inputLabels';
import type { EditorStep, StepFilter } from '@/features/chart-author/types';

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
  step({ id: 'a', tMs: 1_000, input: 'shot', confidence: 0.95 }),
  step({ id: 'b', tMs: 2_500, input: 'melee', origin: 'manual', confidence: 1, detector: null }),
  step({ id: 'c', tMs: 65_432, input: 'bd', confidence: 0.4, detector: 'boost' }),
];

let onSelect: ReturnType<typeof vi.fn>;
let onChangeFilter: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onSelect = vi.fn();
  onChangeFilter = vi.fn();
});

function renderList(props: Partial<React.ComponentProps<typeof StepList>> = {}) {
  const merged: React.ComponentProps<typeof StepList> = {
    steps: STEPS,
    selectedId: null,
    currentTimeMs: 0,
    filter: DEFAULT_STEP_FILTER,
    onSelect,
    onChangeFilter,
    ...props,
  };
  const view = render(<StepList {...merged} />);
  return {
    ...view,
    rerenderWith: (next: Partial<React.ComponentProps<typeof StepList>>) =>
      view.rerender(<StepList {...merged} {...next} />),
  };
}

function rows(): HTMLElement[] {
  return screen.getAllByTestId('step-row');
}

describe('StepList - 一覧表示', () => {
  it('時刻・種別ラベル・信頼度・由来を並べる', () => {
    renderList();

    const first = rows()[0];
    expect(first.textContent).toContain('00:01.000');
    expect(first.textContent).toContain('射撃');
    expect(first.textContent).toContain('0.95');
    expect(first.textContent).toContain('自動');
  });

  it('時刻は分秒ミリ秒の形式で表示する', () => {
    renderList();

    expect(rows()[2].textContent).toContain('01:05.432');
  });

  it('手動のステップは由来を手動として表示する', () => {
    renderList();

    expect(rows()[1].textContent).toContain('手動');
  });

  it('渡された順序によらず時刻の昇順で並べる', () => {
    renderList({ steps: [STEPS[2], STEPS[0], STEPS[1]] });

    expect(rows().map((row) => row.dataset.stepId)).toEqual(['a', 'b', 'c']);
  });

  it('ステップが 1 件もなければその旨を示す', () => {
    renderList({ steps: [] });

    expect(screen.queryAllByTestId('step-row')).toHaveLength(0);
    expect(screen.getByTestId('step-list-empty')).toBeTruthy();
  });
});

describe('StepList - 選択', () => {
  it('行を押すとその id で選択を要求する', () => {
    renderList();

    fireEvent.click(rows()[1]);

    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('選択中の行に印を付ける', () => {
    renderList({ selectedId: 'b' });

    expect(rows().map((row) => row.dataset.selected)).toEqual(['false', 'true', 'false']);
  });
});

describe('StepList - 再生位置の追随', () => {
  it('再生位置に最も近いステップを強調する', () => {
    renderList({ currentTimeMs: 2_400 });

    expect(rows().map((row) => row.dataset.nearest)).toEqual(['false', 'true', 'false']);
  });

  it('再生位置が動けば強調するステップが切り替わる', () => {
    const { rerenderWith } = renderList({ currentTimeMs: 0 });
    expect(rows().map((row) => row.dataset.nearest)).toEqual(['true', 'false', 'false']);

    rerenderWith({ currentTimeMs: 60_000 });

    expect(rows().map((row) => row.dataset.nearest)).toEqual(['false', 'false', 'true']);
  });

  it('ステップがなければ強調する対象もない', () => {
    renderList({ steps: [], currentTimeMs: 1_000 });

    expect(screen.queryAllByTestId('step-row')).toHaveLength(0);
  });
});

describe('StepList - 確認待ちの候補', () => {
  it('ブースト由来のステップを候補として区別する', () => {
    renderList();

    expect(rows().map((row) => row.dataset.candidate)).toEqual(['false', 'false', 'true']);
  });

  it('確認を要する理由が付いたステップも候補として区別する', () => {
    renderList({
      steps: [step({ id: 'x', tMs: 100, detector: 'ammo', caveat: 'direction_unknown' })],
    });

    expect(rows()[0].dataset.candidate).toBe('true');
  });

  it('候補には確認を要する理由を添える', () => {
    renderList({
      steps: [step({ id: 'x', tMs: 100, detector: 'ammo', caveat: 'across_gap' })],
    });

    expect(rows()[0].textContent).toContain('欠測区間');
  });
});

describe('StepList - 絞り込み', () => {
  it('入力種別のチェックを外すと残りの種別で絞り込みを要求する', () => {
    renderList();

    fireEvent.click(screen.getByRole('checkbox', { name: '射撃' }));

    const next = onChangeFilter.mock.calls[0][0] as StepFilter;
    expect(next.inputs).not.toBeNull();
    expect(next.inputs).not.toContain('shot');
    expect(next.inputs).toHaveLength(INPUT_TYPES.length - 1);
  });

  it('外していた種別を戻して全種別が揃えば絞り込みを解除する', () => {
    const inputs = INPUT_TYPES.filter((input) => input !== 'shot');
    renderList({ filter: { ...DEFAULT_STEP_FILTER, inputs } });

    fireEvent.click(screen.getByRole('checkbox', { name: '射撃' }));

    expect((onChangeFilter.mock.calls[0][0] as StepFilter).inputs).toBeNull();
  });

  it('絞り込み中の種別だけをチェック済みとして見せる', () => {
    renderList({ filter: { ...DEFAULT_STEP_FILTER, inputs: ['shot'] } });

    expect((screen.getByRole('checkbox', { name: '射撃' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: '格闘' }) as HTMLInputElement).checked).toBe(false);
  });

  it('由来のチェックを外すと残りの由来で絞り込みを要求する', () => {
    renderList();

    fireEvent.click(screen.getByRole('checkbox', { name: '自動' }));

    expect((onChangeFilter.mock.calls[0][0] as StepFilter).origins).toEqual(['manual']);
  });

  it('最小信頼度を動かすとその値で絞り込みを要求する', () => {
    renderList();

    fireEvent.change(screen.getByRole('slider', { name: '最小信頼度' }), {
      target: { value: '0.5' },
    });

    expect((onChangeFilter.mock.calls[0][0] as StepFilter).minConfidence).toBe(0.5);
  });

  it('現在の最小信頼度を数値でも見せる', () => {
    renderList({ filter: { ...DEFAULT_STEP_FILTER, minConfidence: 0.6 } });

    expect(screen.getByTestId('min-confidence-value').textContent).toContain('0.6');
  });

  it('絞り込みで 0 件になったことが分かる', () => {
    renderList({ steps: [], filter: { ...DEFAULT_STEP_FILTER, minConfidence: 1 } });

    expect(screen.getByTestId('step-list-empty')).toBeTruthy();
  });
});
