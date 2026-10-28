/**
 * ツール配下を計測から外したことの回帰検証。
 *
 * 除外は「送信側（ページビュー）」と「読み込み側（計測スクリプト）」の
 * 両方で効いていなければ意味がない。片方だけ直したまま気づかない事態を
 * 防ぐため、2 つを同じ画面に並べて確かめる（Req 9.3）。
 *
 * 併せて、計測をルートレイアウトから部品へ切り出した変更が、既存ページの
 * 出力を変えていないことも押さえる。
 */
import { isValidElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsPageViewTracker } from '@/features/analytics/AnalyticsPageViewTracker';
import { GoogleAnalyticsScripts } from '@/features/analytics/GoogleAnalyticsScripts';
import { ANALYTICS_EXCLUDED_PATH_PREFIXES } from '@/features/analytics/excludedPaths';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

// next/script は本番で head へ差し込む。テストでは属性を確かめられる素の要素に写す
vi.mock('next/script', () => ({
  default: ({
    id,
    src,
    strategy,
    children,
  }: {
    id?: string;
    src?: string;
    strategy?: string;
    children?: ReactNode;
  }) => (
    <div data-testid="ga-script" id={id} data-src={src} data-strategy={strategy}>
      {children}
    </div>
  ),
}));

// レイアウトはモジュール読み込み時にフォントを組み立てる。実体は検証に関係ない
vi.mock('next/font/google', () => ({
  M_PLUS_1: () => ({ variable: 'font-mplus' }),
  M_PLUS_1_Code: () => ({ variable: 'font-mplus-code' }),
}));

const trackPageView = vi.fn();
vi.mock('@/features/analytics/useAnalytics', () => ({
  useAnalytics: () => ({
    trackSessionStart: vi.fn(),
    trackAttempt: vi.fn(),
    trackSessionEnd: vi.fn(),
    trackPageView,
    trackEvent: vi.fn(),
  }),
}));

import { usePathname } from 'next/navigation';
import RootLayout from '@/app/layout';

/** ルートレイアウトと同じ並びで、計測に関わる 2 つだけを描画する */
function renderAnalyticsAt(pathname: string | null) {
  vi.mocked(usePathname).mockReturnValue(pathname as unknown as string);
  return render(
    <>
      <GoogleAnalyticsScripts />
      <AnalyticsPageViewTracker />
    </>,
  );
}

/** 要素ツリーの中に、その component が現れるか */
function containsComponent(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => containsComponent(child, type));
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  const { children } = node.props as { children?: ReactNode };
  return containsComponent(children, type);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ツール配下の計測除外', () => {
  it('ページビューも計測スクリプトも発生しない', () => {
    const { container } = renderAnalyticsAt('/tools/chart-author');

    expect(trackPageView).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-testid="ga-script"]')).toHaveLength(0);
  });

  it('ツール配下の別のパスでも同じく除外される', () => {
    const { container } = renderAnalyticsAt('/tools/anything/else');

    expect(trackPageView).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-testid="ga-script"]')).toHaveLength(0);
  });

  it('除外パスの定義は 1 箇所だけを見ている', () => {
    expect(ANALYTICS_EXCLUDED_PATH_PREFIXES).toContain('/tools');
  });
});

describe('既存ページの計測', () => {
  it('従来どおりページビューを送信する', () => {
    renderAnalyticsAt('/commands');

    expect(trackPageView).toHaveBeenCalledWith('/commands');
  });

  it('従来どおり 2 つの計測スクリプトを出力する', () => {
    const { container } = renderAnalyticsAt('/practice/abc123');

    expect(container.querySelectorAll('[data-testid="ga-script"]')).toHaveLength(2);
  });

  it('スクリプトの内容も切り出し前から変わっていない', () => {
    const { container } = renderAnalyticsAt('/');

    const loader = container.querySelector('[data-src]');
    expect(loader?.getAttribute('data-src')).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-3YHP7ZY4XV',
    );
    expect(loader?.getAttribute('data-strategy')).toBe('afterInteractive');

    const inline = container.querySelector('#ga-gtag');
    expect(inline?.getAttribute('data-strategy')).toBe('afterInteractive');
    expect(inline?.textContent).toContain("gtag('config', 'G-3YHP7ZY4XV');");
  });
});

describe('ルートレイアウトの構成', () => {
  it('計測スクリプトとページビュー送信の両方を組み込んでいる', () => {
    const tree = RootLayout({ children: null });

    expect(containsComponent(tree, GoogleAnalyticsScripts)).toBe(true);
    expect(containsComponent(tree, AnalyticsPageViewTracker)).toBe(true);
  });

  it('計測スクリプトをレイアウトへ直書きしていない', () => {
    const tree = RootLayout({ children: null });

    // 直書きに戻ると、除外の判定を通らない経路ができてしまう
    expect(containsComponent(tree, 'script')).toBe(false);
  });
});
