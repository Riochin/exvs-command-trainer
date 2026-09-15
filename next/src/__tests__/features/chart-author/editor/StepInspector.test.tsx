import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StepInspector } from '@/features/chart-author/editor/StepInspector';
import { INPUT_TYPES } from '@/features/chart-author/inputLabels';
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

const AUTO_STEP = step({ id: 'a', tMs: 65_432, input: 'shot', confidence: 0.95 });

let handlers: {
  onRemove: ReturnType<typeof vi.fn>;
  onNudge: ReturnType<typeof vi.fn>;
  onChangeInput: ReturnType<typeof vi.fn>;
  onApplyGlobalOffset: ReturnType<typeof vi.fn>;
  onUndo: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  handlers = {
    onRemove: vi.fn(),
    onNudge: vi.fn(),
    onChangeInput: vi.fn(),
    onApplyGlobalOffset: vi.fn(),
    onUndo: vi.fn(),
  };
});

function renderInspector(props: Partial<React.ComponentProps<typeof StepInspector>> = {}) {
  const merged: React.ComponentProps<typeof StepInspector> = {
    step: AUTO_STEP,
    canUndo: true,
    ...handlers,
    ...props,
  };
  const view = render(<StepInspector {...merged} />);
  return {
    ...view,
    rerenderWith: (next: Partial<React.ComponentProps<typeof StepInspector>>) =>
      view.rerender(<StepInspector {...merged} {...next} />),
  };
}

describe('StepInspector - 選択がないとき', () => {
  it('選択を促す表示にする', () => {
    renderInspector({ step: null });

    expect(screen.getByTestId('step-inspector-empty')).toBeTruthy();
  });

  it('ステップへの操作は出さない', () => {
    renderInspector({ step: null });

    expect(screen.queryByRole('button', { name: '選択中のステップを削除' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: '入力種別' })).toBeNull();
  });
});

describe('StepInspector - 選択ステップの表示', () => {
  it('時刻・種別・信頼度・由来を見せる', () => {
    const panel = screen.queryByTestId('step-inspector');
    expect(panel).toBeNull();

    renderInspector();

    const shown = screen.getByTestId('step-inspector').textContent ?? '';
    expect(shown).toContain('01:05.432');
    expect(shown).toContain('0.95');
    expect(shown).toContain('自動');
    expect((screen.getByRole('combobox', { name: '入力種別' }) as HTMLSelectElement).value).toBe(
      'shot',
    );
  });

  it('編集で昇格したステップは手動・信頼度 1 として見せる', () => {
    const { rerenderWith } = renderInspector();
    expect(screen.getByTestId('step-inspector').textContent).toContain('自動');

    rerenderWith({
      step: { ...AUTO_STEP, origin: 'manual', confidence: 1, detector: null },
    });

    const shown = screen.getByTestId('step-inspector').textContent ?? '';
    expect(shown).toContain('手動');
    expect(shown).toContain('1.00');
    expect(shown).not.toContain('自動');
  });
});

describe('StepInspector - ステップの編集', () => {
  it('削除を要求できる', () => {
    renderInspector();

    fireEvent.click(screen.getByRole('button', { name: '選択中のステップを削除' }));

    expect(handlers.onRemove).toHaveBeenCalledWith('a');
  });

  it('1 コマ単位で前後へ動かせる', () => {
    renderInspector();

    fireEvent.click(screen.getByRole('button', { name: '1 コマ前へ' }));
    fireEvent.click(screen.getByRole('button', { name: '1 コマ後ろへ' }));

    expect(handlers.onNudge).toHaveBeenNthCalledWith(1, 'a', -1);
    expect(handlers.onNudge).toHaveBeenNthCalledWith(2, 'a', 1);
  });

  it('入力種別を変更できる', () => {
    renderInspector();

    fireEvent.change(screen.getByRole('combobox', { name: '入力種別' }), {
      target: { value: 'melee' },
    });

    expect(handlers.onChangeInput).toHaveBeenCalledWith('a', 'melee');
  });

  it('選択肢は既存の入力種別だけを並べる', () => {
    renderInspector();

    const options = Array.from(
      (screen.getByRole('combobox', { name: '入力種別' }) as HTMLSelectElement).options,
    ).map((option) => option.value);

    expect(options).toEqual([...INPUT_TYPES]);
  });
});

describe('StepInspector - 全体オフセット', () => {
  it('入力した値で譜面全体をずらせる', () => {
    renderInspector();

    fireEvent.change(screen.getByRole('spinbutton', { name: '編集オフセット（ミリ秒）' }), {
      target: { value: '250' },
    });
    fireEvent.click(screen.getByRole('button', { name: '譜面全体をずらす' }));

    expect(handlers.onApplyGlobalOffset).toHaveBeenCalledWith(250);
  });

  it('負の値で前へずらせる', () => {
    renderInspector();

    fireEvent.change(screen.getByRole('spinbutton', { name: '編集オフセット（ミリ秒）' }), {
      target: { value: '-120' },
    });
    fireEvent.click(screen.getByRole('button', { name: '譜面全体をずらす' }));

    expect(handlers.onApplyGlobalOffset).toHaveBeenCalledWith(-120);
  });

  it('値が空のままでは適用できない', () => {
    renderInspector();

    expect(
      (screen.getByRole('button', { name: '譜面全体をずらす' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('ステップを選んでいなくても操作できる', () => {
    renderInspector({ step: null });

    fireEvent.change(screen.getByRole('spinbutton', { name: '編集オフセット（ミリ秒）' }), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: '譜面全体をずらす' }));

    expect(handlers.onApplyGlobalOffset).toHaveBeenCalledWith(100);
  });

  it('出力時の時刻補正とは別物であることを明示する', () => {
    renderInspector();

    const note = screen.getByTestId('offset-note').textContent ?? '';
    expect(note).toContain('出力');
    expect(note).toContain('別');
  });
});

describe('StepInspector - 取り消し', () => {
  it('直前の操作を打ち消せる', () => {
    renderInspector();

    fireEvent.click(screen.getByRole('button', { name: '直前の操作を取り消す' }));

    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
  });

  it('打ち消せる操作がなければ無効にする', () => {
    renderInspector({ canUndo: false });

    expect(
      (screen.getByRole('button', { name: '直前の操作を取り消す' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
