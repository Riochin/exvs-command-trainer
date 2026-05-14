import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCommandStore } from '@/hooks/useCommandStore';
import { CommandForm } from '@/features/command-editor/CommandForm';
import { CommandList } from '@/features/command-editor/CommandList';
import { flushChargeDeferredInput } from '@/__tests__/utils/flushChargeDeferredInput';
import { flushBdDetection } from '@/__tests__/utils/flushBdDetection';
import type { Command } from '@/types';

// 実フックに接続したラッパーコンポーネント
function CommandRegistrationTest({ onSuccess }: { onSuccess?: () => void }) {
  const { addCommand } = useCommandStore();
  return <CommandForm onAdd={addCommand} onSuccess={onSuccess ?? (() => {})} />;
}

function CommandManagementTest() {
  const { commands, removeCommand } = useCommandStore();
  return <CommandList commands={commands} onDelete={(id) => { removeCommand(id); }} />;
}

const STORAGE_KEY = 'ct_commands';

describe('コマンド登録フロー 統合テスト', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('CommandForm → useCommandStore → localStorage End-to-End', () => {
    it('フォーム送信でコマンドが localStorage の ct_commands に保存される', async () => {
      render(<CommandRegistrationTest />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'ストライクフリーダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'ズンダ' } });
      await act(async () => {
        fireEvent.pointerDown(screen.getByRole('button', { name: 'ジャンプ' }));
        fireEvent.pointerUp(screen.getByRole('button', { name: 'ジャンプ' }));
      });
      await flushBdDetection();
      await act(async () => {
        fireEvent.pointerDown(screen.getByRole('button', { name: 'ジャンプ' }));
        fireEvent.pointerUp(screen.getByRole('button', { name: 'ジャンプ' }));
      });
      await flushBdDetection();
      await act(async () => {
        fireEvent.pointerDown(screen.getByRole('button', { name: '射撃' }));
        fireEvent.pointerUp(screen.getByRole('button', { name: '射撃' }));
      });
      await flushChargeDeferredInput();
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw!) as Command[];
      expect(stored).toHaveLength(1);
      expect(stored[0].mobileSuit).toBe('ストライクフリーダム');
      expect(stored[0].name).toBe('ズンダ');
      expect(stored[0].sequence).toHaveLength(3);
    });

    it('保存後のコマンドに UUID v4 形式の id が付与される', async () => {
      render(<CommandRegistrationTest />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'BR' } });
      await act(async () => {
        fireEvent.pointerDown(screen.getByRole('button', { name: '射撃' }));
        fireEvent.pointerUp(screen.getByRole('button', { name: '射撃' }));
      });
      await flushChargeDeferredInput();
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Command[];
      expect(stored[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('保存後に onSuccess コールバックが呼ばれる', async () => {
      const onSuccess = vi.fn();
      render(<CommandRegistrationTest onSuccess={onSuccess} />);
      fireEvent.change(screen.getByLabelText('機体名'), { target: { value: 'νガンダム' } });
      fireEvent.change(screen.getByLabelText('コマンド名'), { target: { value: 'BR' } });
      await act(async () => {
        fireEvent.pointerDown(screen.getByRole('button', { name: '射撃' }));
        fireEvent.pointerUp(screen.getByRole('button', { name: '射撃' }));
      });
      await flushChargeDeferredInput();
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  describe('削除確認ダイアログのキャンセルでコマンドが保持される', () => {
    const preloadCommand: Command = {
      id: 'cmd-1',
      mobileSuit: 'νガンダム',
      name: 'ズンダ',
      sequence: [{ buttons: ['shot'] }],
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    it('削除ダイアログでキャンセルすると localStorage のコマンドが残る', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([preloadCommand]));
      render(<CommandManagementTest />);
      fireEvent.click(screen.getByRole('button', { name: /削除/ }));
      expect(screen.getByRole('dialog')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Command[];
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('cmd-1');
    });

    it('削除ダイアログで確定すると localStorage からコマンドが削除される', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([preloadCommand]));
      render(<CommandManagementTest />);
      fireEvent.click(screen.getByRole('button', { name: /削除/ }));
      fireEvent.click(screen.getByRole('button', { name: /削除する/ }));

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Command[];
      expect(stored).toHaveLength(0);
    });

    it('キャンセル後にコマンドが画面に残っている', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([preloadCommand]));
      render(<CommandManagementTest />);
      fireEvent.click(screen.getByRole('button', { name: /削除/ }));
      fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));
      expect(screen.getByText('ズンダ')).toBeTruthy();
    });
  });
});
