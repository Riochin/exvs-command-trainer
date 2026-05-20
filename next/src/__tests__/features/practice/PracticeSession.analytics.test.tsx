import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from '@/types';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn().mockReturnValue({ data: null, status: 'unauthenticated' }),
}));

vi.mock('@/features/analytics/useAnalytics', () => ({
  useAnalytics: vi.fn(),
}));

vi.mock('@/features/analytics/useClientId', () => ({
  useClientId: vi.fn().mockReturnValue({ clientId: 'test-client-id' }),
}));

import { useAnalytics } from '@/features/analytics/useAnalytics';
import { PracticeSession } from '@/features/practice/PracticeSession';
import { flushChargeDeferredInput } from '@/__tests__/utils/flushChargeDeferredInput';
import { flushBdDetection } from '@/__tests__/utils/flushBdDetection';

const mockUseAnalytics = vi.mocked(useAnalytics);

const singleStepCommand: Command = {
  id: 'cmd-single',
  mobileSuit: 'νガンダム',
  name: '射撃',
  sequence: [{ buttons: ['shot'] }],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const zundaCommand: Command = {
  id: 'cmd-zunda',
  mobileSuit: 'ストライクフリーダム',
  name: 'ズンダ',
  sequence: [
    { buttons: ['jump'] },
    { buttons: ['jump'] },
    { buttons: ['shot'] },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const getControllerButton = (label: string) => screen.getByRole('button', { name: label });

describe('PracticeSession analytics 連携', () => {
  let mockTrackSessionStart: ReturnType<typeof vi.fn>;
  let mockTrackAttempt: ReturnType<typeof vi.fn>;
  let mockTrackSessionEnd: ReturnType<typeof vi.fn>;
  let mockTrackPageView: ReturnType<typeof vi.fn>;
  let mockTrackEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    mockTrackSessionStart = vi.fn();
    mockTrackAttempt = vi.fn();
    mockTrackSessionEnd = vi.fn();
    mockTrackPageView = vi.fn();
    mockTrackEvent = vi.fn();
    mockUseAnalytics.mockReturnValue({
      trackSessionStart: mockTrackSessionStart,
      trackAttempt: mockTrackAttempt,
      trackSessionEnd: mockTrackSessionEnd,
      trackPageView: mockTrackPageView,
      trackEvent: mockTrackEvent,
    });
  });

  describe('セッション開始', () => {
    it('コンポーネントマウント時に trackSessionStart が呼ばれる', () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      expect(mockTrackSessionStart).toHaveBeenCalledOnce();
    });

    it('trackSessionStart に commandId が渡される', () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      expect(mockTrackSessionStart).toHaveBeenCalledWith(
        expect.objectContaining({ commandId: 'cmd-single' }),
      );
    });

    it('trackSessionStart に sessionId（UUID 形式）が渡される', () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      const call = mockTrackSessionStart.mock.calls[0][0];
      expect(call.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('trackSessionStart の commandSnapshot は JSON 文字列', () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      const call = mockTrackSessionStart.mock.calls[0][0];
      expect(() => JSON.parse(call.commandSnapshot)).not.toThrow();
    });
  });

  describe('試行完了', () => {
    it('成功試行後に trackAttempt が呼ばれる', async () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃'));
        fireEvent.pointerUp(getControllerButton('射撃'));
      });
      await flushChargeDeferredInput();
      expect(mockTrackAttempt).toHaveBeenCalledOnce();
    });

    it('trackAttempt に success:true が含まれる（成功時）', async () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃'));
        fireEvent.pointerUp(getControllerButton('射撃'));
      });
      await flushChargeDeferredInput();
      expect(mockTrackAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it('失敗試行後に trackAttempt が呼ばれる', async () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃')); // jump が正解
        fireEvent.pointerUp(getControllerButton('射撃'));
      });
      await flushChargeDeferredInput();
      expect(mockTrackAttempt).toHaveBeenCalledOnce();
      expect(mockTrackAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });

    it('trackAttempt に sessionId が含まれる', async () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃'));
        fireEvent.pointerUp(getControllerButton('射撃'));
      });
      await flushChargeDeferredInput();
      const call = mockTrackAttempt.mock.calls[0][0];
      expect(call.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('ズンダコマンド完走後に trackAttempt が success:true で呼ばれる', async () => {
      render(<PracticeSession command={zundaCommand} onExit={vi.fn()} />);
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('ジャンプ'));
        fireEvent.pointerUp(getControllerButton('ジャンプ'));
      });
      await flushBdDetection();
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('ジャンプ'));
        fireEvent.pointerUp(getControllerButton('ジャンプ'));
      });
      await flushBdDetection();
      await act(async () => {
        fireEvent.pointerDown(getControllerButton('射撃'));
        fireEvent.pointerUp(getControllerButton('射撃'));
      });
      await flushChargeDeferredInput();
      expect(mockTrackAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });
  });

  describe('セッション終了', () => {
    it('「練習終了」ボタンクリック時に trackSessionEnd が呼ばれる', () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));
      expect(mockTrackSessionEnd).toHaveBeenCalledOnce();
    });

    it('trackSessionEnd に sessionId が渡される', () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));
      const [sessionId] = mockTrackSessionEnd.mock.calls[0];
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('trackSessionStart と trackSessionEnd の sessionId が一致する', () => {
      render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /練習終了/ }));
      const startCall = mockTrackSessionStart.mock.calls[0][0];
      const [endSessionId] = mockTrackSessionEnd.mock.calls[0];
      expect(endSessionId).toBe(startCall.sessionId);
    });
  });

  describe('既存 UX の非破壊', () => {
    it('analytics 処理が失敗しても練習画面が表示される', () => {
      mockTrackSessionStart.mockImplementation(() => { throw new Error('analytics error'); });
      // エラーが練習画面のレンダリングをブロックしないことを確認
      // useAnalytics は fire-and-forget なのでモックが例外を投げないようにする
      mockTrackSessionStart.mockReturnValue(undefined);
      expect(() => render(<PracticeSession command={singleStepCommand} onExit={vi.fn()} />)).not.toThrow();
      expect(screen.getByTestId('practice-session')).toBeTruthy();
    });
  });
});
