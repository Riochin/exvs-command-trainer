import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommandList } from '@/features/command-editor/CommandList';
import type { Command } from '@/types';

const makeCommand = (overrides: Partial<Command> & { id: string; mobileSuit: string; name: string }): Command => ({
  sequence: [{ buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('CommandList', () => {
  describe('コマンドが空の場合', () => {
    it('「登録されたコマンドはありません」メッセージを表示する', () => {
      render(<CommandList commands={[]} onDelete={vi.fn()} />);
      expect(screen.getByText('登録されたコマンドはありません')).toBeTruthy();
    });
  });

  describe('コマンドの表示', () => {
    it('コマンド名が表示される', () => {
      const commands = [makeCommand({ id: '1', mobileSuit: 'νガンダム', name: 'ズンダ' })];
      render(<CommandList commands={commands} onDelete={vi.fn()} />);
      expect(screen.getByText('ズンダ')).toBeTruthy();
    });

    it('機体名でグループ化されて表示される', () => {
      const commands = [
        makeCommand({ id: '1', mobileSuit: 'νガンダム', name: 'ズンダ' }),
        makeCommand({ id: '2', mobileSuit: 'νガンダム', name: 'BR' }),
        makeCommand({ id: '3', mobileSuit: 'ストライクフリーダム', name: 'クロスボーン' }),
      ];
      render(<CommandList commands={commands} onDelete={vi.fn()} />);
      expect(screen.getByText('νガンダム')).toBeTruthy();
      expect(screen.getByText('ストライクフリーダム')).toBeTruthy();
      expect(screen.getByText('ズンダ')).toBeTruthy();
      expect(screen.getByText('BR')).toBeTruthy();
      expect(screen.getByText('クロスボーン')).toBeTruthy();
    });

    it('複数の機体グループが表示される', () => {
      const commands = [
        makeCommand({ id: '1', mobileSuit: 'νガンダム', name: 'ズンダ' }),
        makeCommand({ id: '2', mobileSuit: 'ストライクフリーダム', name: 'クロスボーン' }),
      ];
      render(<CommandList commands={commands} onDelete={vi.fn()} />);
      const groups = screen.getAllByRole('group');
      expect(groups).toHaveLength(2);
    });
  });

  describe('削除操作', () => {
    it('削除ボタンが各コマンドに存在する', () => {
      const commands = [
        makeCommand({ id: '1', mobileSuit: 'νガンダム', name: 'ズンダ' }),
        makeCommand({ id: '2', mobileSuit: 'νガンダム', name: 'BR' }),
      ];
      render(<CommandList commands={commands} onDelete={vi.fn()} />);
      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      expect(deleteButtons).toHaveLength(2);
    });

    it('削除ボタンを押すと確認ダイアログが表示される', () => {
      const commands = [makeCommand({ id: '1', mobileSuit: 'νガンダム', name: 'ズンダ' })];
      render(<CommandList commands={commands} onDelete={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /削除/ }));
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('確認ダイアログで確定すると onDelete が呼ばれる', () => {
      const onDelete = vi.fn();
      const commands = [makeCommand({ id: 'cmd-1', mobileSuit: 'νガンダム', name: 'ズンダ' })];
      render(<CommandList commands={commands} onDelete={onDelete} />);
      fireEvent.click(screen.getByRole('button', { name: /削除/ }));
      fireEvent.click(screen.getByRole('button', { name: /確認|削除する|はい/ }));
      expect(onDelete).toHaveBeenCalledWith('cmd-1');
    });

    it('確認ダイアログでキャンセルすると onDelete が呼ばれない', () => {
      const onDelete = vi.fn();
      const commands = [makeCommand({ id: 'cmd-1', mobileSuit: 'νガンダム', name: 'ズンダ' })];
      render(<CommandList commands={commands} onDelete={onDelete} />);
      fireEvent.click(screen.getByRole('button', { name: /削除/ }));
      fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('キャンセル後にダイアログが閉じる', () => {
      const commands = [makeCommand({ id: '1', mobileSuit: 'νガンダム', name: 'ズンダ' })];
      render(<CommandList commands={commands} onDelete={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /削除/ }));
      expect(screen.getByRole('dialog')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
