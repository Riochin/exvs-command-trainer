import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('open=true のとき dialog が表示される', () => {
    render(
      <ConfirmDialog
        open={true}
        message="本当に削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('open=false のとき dialog が表示されない', () => {
    render(
      <ConfirmDialog
        open={false}
        message="本当に削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('message が表示される', () => {
    render(
      <ConfirmDialog
        open={true}
        message="本当に削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('本当に削除しますか？')).toBeTruthy();
  });

  it('確認ボタンを押すと onConfirm が呼ばれる', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        message="削除しますか？"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /確認|削除する|はい/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('キャンセルボタンを押すと onCancel が呼ばれる', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        message="削除しますか？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('確認ボタンを押しても onCancel は呼ばれない', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        message="削除しますか？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /確認|削除する|はい/ }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
