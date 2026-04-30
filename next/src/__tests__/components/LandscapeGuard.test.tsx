import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LandscapeGuard } from '@/components/LandscapeGuard';

vi.mock('@/hooks/useLandscapeMode', () => ({
  useLandscapeMode: vi.fn(),
}));

import { useLandscapeMode } from '@/hooks/useLandscapeMode';
const mockUseLandscapeMode = vi.mocked(useLandscapeMode);

describe('LandscapeGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isLandscape=true のとき children が表示される', () => {
    mockUseLandscapeMode.mockReturnValue({ isLandscape: true });
    render(
      <LandscapeGuard>
        <div>練習UI</div>
      </LandscapeGuard>
    );
    expect(screen.getByText('練習UI')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('isLandscape=null（hydration前）のとき children が表示され CLSを防ぐ', () => {
    mockUseLandscapeMode.mockReturnValue({ isLandscape: null });
    render(
      <LandscapeGuard>
        <div>練習UI</div>
      </LandscapeGuard>
    );
    expect(screen.getByText('練習UI')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('isLandscape=false（縦画面）のとき children がブロックされる', () => {
    mockUseLandscapeMode.mockReturnValue({ isLandscape: false });
    render(
      <LandscapeGuard>
        <div>練習UI</div>
      </LandscapeGuard>
    );
    expect(screen.queryByText('練習UI')).toBeNull();
  });

  it('isLandscape=false のとき回転促進メッセージが表示される', () => {
    mockUseLandscapeMode.mockReturnValue({ isLandscape: false });
    render(
      <LandscapeGuard>
        <div>練習UI</div>
      </LandscapeGuard>
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('縦画面時のメッセージに横向きへの案内テキストが含まれる', () => {
    mockUseLandscapeMode.mockReturnValue({ isLandscape: false });
    render(
      <LandscapeGuard>
        <div>練習UI</div>
      </LandscapeGuard>
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('横向き');
  });

  it('縦画面時に回転アイコンが表示される', () => {
    mockUseLandscapeMode.mockReturnValue({ isLandscape: false });
    render(
      <LandscapeGuard>
        <div>練習UI</div>
      </LandscapeGuard>
    );
    expect(screen.getByTestId('rotate-icon')).toBeTruthy();
  });
});
