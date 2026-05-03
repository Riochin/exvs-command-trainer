import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommandForm } from '@/features/command-editor/CommandForm';
import { flushChargeDeferredInput } from '@/__tests__/utils/flushChargeDeferredInput';
import type { CommandStep, StorageResult, Command } from '@/types';

const makeAddCommand = (result: StorageResult<Command> = { ok: true, value: { id: '1', mobileSuit: 'ν', name: 'test', sequence: [{ buttons: ['shot'] }], createdAt: '' } }) =>
  vi.fn(() => result);

describe('CommandForm', () => {
  describe('初期状態', () => {
    it('機体名フィールドが空で表示される', () => {
      render(<CommandForm onAdd={makeAddCommand()} onSuccess={vi.fn()} />);
      const input = screen.getByLabelText('機体名') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('コマンド名フィールドが空で表示される', () => {
      render(<CommandForm onAdd={makeAddCommand()} onSuccess={vi.fn()} />);
      const input = screen.getByLabelText('コマンド名') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('保存ボタンが無効になっている', () => {
      render(<CommandForm onAdd={makeAddCommand()} onSuccess={vi.fn()} />);
      const button = screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  describe('バリデーション', () => {
    it('機体名のみ入力しても保存ボタンは無効', () => {
      render(<CommandForm onAdd={makeAddCommand()} onSuccess={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      const button = screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it('機体名とコマンド名を入力してもシーケンスが空なら保存ボタンは無効', () => {
      render(<CommandForm onAdd={makeAddCommand()} onSuccess={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'ズンダ' } });
      const button = screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it('全フィールドが入力されると保存ボタンが有効になる', async () => {
      const onAdd = vi.fn(() => ({ ok: true as const, value: { id: '1', mobileSuit: 'νガンダム', name: 'ズンダ', sequence: [{ buttons: ['shot'] as ['shot'] }], createdAt: '' } }));
      render(<CommandForm onAdd={onAdd} onSuccess={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'ズンダ' } });
      // ArcadeController の射撃ボタンを押してシーケンスを追加
      await act(async () => {
        fireEvent.pointerDown(screen.getByText('射撃'));
        fireEvent.pointerUp(screen.getByText('射撃'));
      });
      await flushChargeDeferredInput();
      const button = screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
  });

  describe('シーケンス構築', () => {
    it('ボタンをタップするとシーケンスプレビューにステップが追加される', async () => {
      render(<CommandForm onAdd={makeAddCommand()} onSuccess={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(screen.getByText('ジャンプ'));
        fireEvent.pointerUp(screen.getByText('ジャンプ'));
      });
      expect(screen.getByTestId('sequence-preview')).toBeTruthy();
      expect(screen.getByTestId('sequence-preview').textContent).toContain('ジャンプ');
    });

    it('複数のボタンをタップするとステップが順番に追加される', async () => {
      render(<CommandForm onAdd={makeAddCommand()} onSuccess={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(screen.getByText('ジャンプ'));
        fireEvent.pointerUp(screen.getByText('ジャンプ'));
      });
      await act(async () => {
        fireEvent.pointerDown(screen.getByText('射撃'));
        fireEvent.pointerUp(screen.getByText('射撃'));
      });
      await flushChargeDeferredInput();
      const preview = screen.getByTestId('sequence-preview');
      const steps = preview.querySelectorAll('[data-testid="sequence-step"]');
      expect(steps).toHaveLength(2);
    });
  });

  describe('保存処理', () => {
    it('保存ボタンを押すと onAdd が呼ばれる', async () => {
      const onAdd = makeAddCommand();
      render(<CommandForm onAdd={onAdd} onSuccess={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'ズンダ' } });
      await act(async () => {
        fireEvent.pointerDown(screen.getByText('射撃'));
        fireEvent.pointerUp(screen.getByText('射撃'));
      });
      await flushChargeDeferredInput();
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));
      expect(onAdd).toHaveBeenCalledWith({
        mobileSuit: 'νガンダム',
        name: 'ズンダ',
        sequence: [{ buttons: ['shot'] }] as CommandStep[],
      });
    });

    it('保存成功後に onSuccess が呼ばれる', async () => {
      const onSuccess = vi.fn();
      const onAdd = makeAddCommand();
      render(<CommandForm onAdd={onAdd} onSuccess={onSuccess} />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'ズンダ' } });
      await act(async () => {
        fireEvent.pointerDown(screen.getByText('射撃'));
        fireEvent.pointerUp(screen.getByText('射撃'));
      });
      await flushChargeDeferredInput();
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));
      expect(onSuccess).toHaveBeenCalledOnce();
    });

    it('書き込みエラー時はエラーメッセージを表示する', async () => {
      const onAdd = vi.fn(() => ({
        ok: false as const,
        error: { type: 'quota_exceeded' as const, message: 'ストレージ容量が不足しています' },
      }));
      render(<CommandForm onAdd={onAdd} onSuccess={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'ズンダ' } });
      await act(async () => {
        fireEvent.pointerDown(screen.getByText('射撃'));
        fireEvent.pointerUp(screen.getByText('射撃'));
      });
      await flushChargeDeferredInput();
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toContain('ストレージ容量が不足しています');
    });

    it('書き込みエラー時は入力データを保持する', async () => {
      const onAdd = vi.fn(() => ({
        ok: false as const,
        error: { type: 'quota_exceeded' as const, message: 'エラー' },
      }));
      render(<CommandForm onAdd={onAdd} onSuccess={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'ズンダ' } });
      await act(async () => {
        fireEvent.pointerDown(screen.getByText('射撃'));
        fireEvent.pointerUp(screen.getByText('射撃'));
      });
      await flushChargeDeferredInput();
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));
      expect((screen.getByLabelText('機体名') as HTMLInputElement).value).toBe('νガンダム');
      expect((screen.getByLabelText('コマンド名') as HTMLInputElement).value).toBe('ズンダ');
    });
  });
});
