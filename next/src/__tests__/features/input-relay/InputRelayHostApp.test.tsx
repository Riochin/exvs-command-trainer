import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

// 3D・接続・ログインはこのテストでは使わないので差し替える
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/AuthButton', () => ({ AuthButton: () => null }));
vi.mock('@/features/input-relay/JoinQrCode', () => ({ JoinQrCode: () => null }));
vi.mock('@/features/input-relay/useRelayHost', () => ({
  useRelayHost: () => ({
    room: 'CDYZ',
    connection: 'waiting',
    error: null,
    rttMs: [],
    latencyMs: [],
    log: [],
    lostCount: 0,
    restart: () => {},
  }),
}));

import { InputRelayHostApp } from '@/features/input-relay/InputRelayHostApp';

/** 指で操作する端末かどうかを決めて matchMedia を差し替える */
function mockPointer(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: coarse,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/** 最初に出る機体選択を閉じる（接続案内はその後に出る） */
function closeUnitSelect() {
  fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// 画面全体を描画するので重い。並行実行時でも時間切れにならないよう長めに待つ
describe('InputRelayHostApp の接続案内', { timeout: 20_000 }, () => {
  it('PC で開くと、機体選択の後に接続案内を出す', () => {
    mockPointer(false);
    render(<InputRelayHostApp lanOrigins={[]} />);
    closeUnitSelect();
    expect(screen.getByRole('button', { name: '接続案内を閉じる' })).toBeTruthy();
  });

  it('スマホで開くと接続案内を出さず、設定から開ける', () => {
    mockPointer(true);
    render(<InputRelayHostApp lanOrigins={[]} />);
    closeUnitSelect();
    expect(screen.queryByRole('button', { name: '接続案内を閉じる' })).toBeNull();
    // 接続状態の表示は残す
    expect(screen.getAllByText(/スマホの接続待ち/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /設定・メニュー/ }));
    fireEvent.click(screen.getByRole('button', { name: '接続案内を表示する' }));
    // 設定を閉じると案内が出る
    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    expect(screen.getByRole('button', { name: '接続案内を閉じる' })).toBeTruthy();
  });
});
