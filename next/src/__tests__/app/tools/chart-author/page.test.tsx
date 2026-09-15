import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChartAuthorPage from '@/app/tools/chart-author/page';
import { HamburgerMenu } from '@/components/HamburgerMenu';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/tools/chart-author'),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn().mockReturnValue({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

/** 縦向き（portrait）の matchMedia を用意する */
function mockPortrait() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('ChartAuthorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPortrait();
  });

  it('専用ルートに直接アクセスすると画面が表示される', () => {
    render(<ChartAuthorPage />);

    expect(screen.getByRole('heading', { name: /譜面作成/ })).toBeDefined();
  });

  it('縦向きでも横画面ガードの警告を出さない', () => {
    render(<ChartAuthorPage />);

    expect(screen.queryByText('デバイスを横向きにしてください')).toBeNull();
    expect(screen.queryByTestId('rotate-icon')).toBeNull();
  });

  it('ページ全体を高さいっぱいのレイアウトとして描画する', () => {
    const { container } = render(<ChartAuthorPage />);

    const root = container.querySelector('[data-testid="chart-author-app"]');
    expect(root).not.toBeNull();
    expect(root?.className).toMatch(/app/);
  });

  it('縦に長くなる領域だけが内部スクロールを持つ', () => {
    render(<ChartAuthorPage />);

    const scrollable = screen.getByTestId('chart-author-scroll-region');
    expect(scrollable.className).toMatch(/scrollRegion/);
  });
});

describe('主導線のメニュー', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPortrait();
  });

  it('メニューを開いてもツールへのリンクが現れない', () => {
    render(<HamburgerMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));

    // 主導線のリンクが描画されていることを先に確かめ、空振りの検証を避ける
    expect(screen.getByRole('link', { name: 'フリー練習' })).toBeDefined();

    const links = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).not.toContain('/tools/chart-author');
    expect(links.some((href) => href?.startsWith('/tools'))).toBe(false);
  });
});
