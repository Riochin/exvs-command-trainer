/**
 * ツールの置き場所と、アーケードコントローラ連携の検証。
 *
 * このツールは練習画面と同じアプリの中にありながら、主導線からは辿れず
 * 横画面の制約も受けない（Req 9.1, 9.2）。コントローラだけは既存実装を
 * そのまま借りる（Req 9.4）ので、借り方が正しいかをここで確かめる。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSession } from 'next-auth/react';
import ChartAuthorPage from '@/app/(site)/tools/chart-author/page';
import { HamburgerMenu } from '@/components/HamburgerMenu';
import { loadVideo, renderApp, stepRows } from '../features/chart-author/appHarness';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/tools/chart-author'),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn().mockReturnValue({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

/** 縦向き（portrait）の matchMedia を用意する */
function mockPortrait(): void {
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

function controllerButton(label: '射撃' | '格闘' | 'ジャンプ'): HTMLElement {
  const controller = within(screen.getByTestId('chart-author-controller'));
  const button = controller.getByText(label).closest('button');
  if (button === null) throw new Error(`${label} ボタンが見つかりません`);
  return button;
}

async function tapShot(): Promise<void> {
  const shot = controllerButton('射撃');
  fireEvent.pointerDown(shot, { pointerId: 1 });
  fireEvent.pointerUp(shot, { pointerId: 1 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  // clearAllMocks は戻り値の設定も落とすので、毎回入れ直す
  vi.mocked(useSession).mockReturnValue({
    data: null,
    status: 'unauthenticated',
  } as unknown as ReturnType<typeof useSession>);
  mockPortrait();
});

describe('ツールの置き場所', () => {
  it('縦向きでも横画面ガードの警告を出さない', () => {
    render(<ChartAuthorPage />);

    expect(screen.queryByText('デバイスを横向きにしてください')).toBeNull();
    expect(screen.queryByTestId('rotate-icon')).toBeNull();
  });

  it('縦向きのままでも操作できる', () => {
    render(<ChartAuthorPage />);

    expect(screen.getByLabelText('動画ファイル')).toBeTruthy();
    expect(screen.getByTestId('export-panel')).toBeTruthy();
  });

  it('主導線のメニューにツールへのリンクが現れない', () => {
    render(<HamburgerMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));

    // 主導線のリンクが描画されていることを先に確かめ、空振りの検証を避ける
    expect(screen.getByRole('link', { name: 'フリー練習' })).toBeTruthy();

    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.some((href) => href?.startsWith('/tools') === true)).toBe(false);
  });

  it('本文スクロールの代わりに、縦へ伸びる領域だけが内部でスクロールする', () => {
    render(<ChartAuthorPage />);

    expect(screen.getByTestId('chart-author-scroll-region').className).toMatch(/scrollRegion/);
    expect(screen.getByTestId('chart-author-app').className).toMatch(/app/);
  });
});

describe('アーケードコントローラ連携', () => {
  it('一時停止中のボタン押下でステップが増える', async () => {
    renderApp();
    await loadVideo();

    await tapShot();

    expect(stepRows()).toHaveLength(1);
    expect(stepRows()[0].textContent).toContain('射撃');
  });

  it('再生中のボタン押下ではステップが増えない', async () => {
    renderApp();
    await loadVideo();

    fireEvent.click(screen.getByRole('button', { name: '再生' }));
    await tapShot();

    expect(stepRows()).toHaveLength(0);
  });

  it('コントローラの入力検出はそのまま借りる（合成もデバッグキーも効く）', async () => {
    renderApp();
    await loadVideo();

    fireEvent.pointerDown(controllerButton('射撃'), { pointerId: 1 });
    fireEvent.pointerDown(controllerButton('格闘'), { pointerId: 2 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    fireEvent.keyDown(window, { key: 'y' });
    fireEvent.keyUp(window, { key: 'y' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const texts = stepRows().map((row) => row.textContent ?? '');
    expect(texts.some((text) => text.includes('サブ'))).toBe(true);
    expect(texts.some((text) => text.includes('格闘'))).toBe(true);
  });
});
