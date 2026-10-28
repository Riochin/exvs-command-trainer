import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RelayControl } from '@/features/input-relay/RelayControl';

describe('RelayControl', () => {
  it('未接続なら「PC連携」を出し、押すとコード入力ダイアログを開く', () => {
    render(<RelayControl room={null} connection="idle" error={null} onRoomChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'PC連携' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '切断' })).toBeNull();
  });

  it('入力を大文字にそろえ、4 文字そろうまで接続できない', () => {
    const onRoomChange = vi.fn();
    render(<RelayControl room={null} connection="idle" error={null} onRoomChange={onRoomChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'PC連携' }));
    const input = screen.getByLabelText('ルームコード') as HTMLInputElement;
    const submit = screen.getByRole('button', { name: '接続' }) as HTMLButtonElement;

    fireEvent.change(input, { target: { value: 'ab-' } });
    expect(input.value).toBe('AB');
    expect(submit.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'abcd' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onRoomChange).toHaveBeenCalledWith('ABCD');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('接続中のルームは状態を表示し、切断できる', () => {
    const onRoomChange = vi.fn();
    render(<RelayControl room="WQ5R" connection="error" error="answer を作れませんでした" onRoomChange={onRoomChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'PC エラー' }));
    expect(screen.getByRole('dialog').textContent).toContain('ROOM WQ5R：接続できませんでした');
    expect(screen.getByRole('dialog').textContent).toContain('answer を作れませんでした');
    fireEvent.click(screen.getByRole('button', { name: '切断' }));
    expect(onRoomChange).toHaveBeenCalledWith(null);
  });
});
