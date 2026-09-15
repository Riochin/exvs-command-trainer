import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RerunDecisionDialog } from '@/features/chart-author/analysis-run/RerunDecisionDialog';

let handlers: {
  onDecide: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  handlers = { onDecide: vi.fn(), onCancel: vi.fn() };
});

function renderDialog(props: Partial<React.ComponentProps<typeof RerunDecisionDialog>> = {}) {
  return render(
    <RerunDecisionDialog open manualStepCount={3} {...handlers} {...props} />,
  );
}

describe('RerunDecisionDialog', () => {
  it('自動検出のみ差し替え・全ステップ破棄・取りやめの 3 択を出す', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: '自動検出のみ差し替え' })).toBeDefined();
    expect(screen.getByRole('button', { name: '全ステップ破棄' })).toBeDefined();
    expect(screen.getByRole('button', { name: '取りやめ' })).toBeDefined();
  });

  it('手動で加えたステップの件数を伝える', () => {
    renderDialog({ manualStepCount: 12 });

    expect(screen.getByTestId('rerun-manual-count').textContent).toContain('12');
  });

  it('自動検出のみ差し替えを選ぶと方針として通知する', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '自動検出のみ差し替え' }));

    expect(handlers.onDecide).toHaveBeenCalledWith('replace_auto_only');
  });

  it('全ステップ破棄を選ぶと方針として通知する', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '全ステップ破棄' }));

    expect(handlers.onDecide).toHaveBeenCalledWith('discard_all');
  });

  it('取りやめでは方針を決めない', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '取りやめ' }));

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onDecide).not.toHaveBeenCalled();
  });

  it('Escape でも取りやめになる', () => {
    renderDialog();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it('開いていなければ描画しない', () => {
    const { container } = renderDialog({ open: false });

    expect(container.firstChild).toBeNull();
  });

  it('作業を止める問いかけとして描く', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});
