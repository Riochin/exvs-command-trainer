import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackToHomeNav } from '@/components/BackToHomeNav';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from 'next/navigation';

const mockUsePathname = vi.mocked(usePathname);

describe('BackToHomeNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pathname が /practice（フリー練習）のときリンクを表示しない', () => {
    mockUsePathname.mockReturnValue('/practice');
    render(<BackToHomeNav />);
    expect(screen.queryByRole('link', { name: /コマンド一覧に戻る/ })).toBeNull();
  });

  it('フリー練習・一覧以外のときコマンド一覧へのリンクを表示する', () => {
    mockUsePathname.mockReturnValue('/commands/foo');
    render(<BackToHomeNav />);
    const link = screen.getByRole('link', { name: /コマンド一覧に戻る/ });
    expect(link.getAttribute('href')).toBe('/commands');
  });
});
