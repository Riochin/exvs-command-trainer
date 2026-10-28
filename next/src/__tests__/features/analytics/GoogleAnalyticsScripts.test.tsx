import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAnalyticsScripts } from '@/features/analytics/GoogleAnalyticsScripts';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

// next/script は本番で head へ差し込む。テストでは渡された属性を検証できる
// 素の要素へ写して描画する（script 要素にすると同期スクリプト扱いになるため div）
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
    children?: React.ReactNode;
  }) => (
    <div data-testid="ga-script" id={id} data-src={src} data-strategy={strategy}>
      {children}
    </div>
  ),
}));

import { usePathname } from 'next/navigation';

const mockUsePathname = vi.mocked(usePathname);

function renderAt(pathname: string | null) {
  mockUsePathname.mockReturnValue(pathname as unknown as string);
  return render(<GoogleAnalyticsScripts />);
}

describe('GoogleAnalyticsScripts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('既存ページでは従来どおり 2 つのスクリプトを描画する', () => {
    const { container } = renderAt('/commands');

    const scripts = container.querySelectorAll('[data-testid="ga-script"]');
    expect(scripts).toHaveLength(2);
  });

  it('gtag.js の src と strategy を変えない', () => {
    const { container } = renderAt('/');

    const loader = container.querySelector('[data-src]');
    expect(loader?.getAttribute('data-src')).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-3YHP7ZY4XV',
    );
    expect(loader?.getAttribute('data-strategy')).toBe('afterInteractive');
  });

  it('インラインスクリプトの id と設定内容を変えない', () => {
    const { container } = renderAt('/practice/abc123');

    const inline = container.querySelector('#ga-gtag');
    expect(inline).not.toBeNull();
    expect(inline?.getAttribute('data-strategy')).toBe('afterInteractive');
    expect(inline?.textContent).toContain('window.dataLayer = window.dataLayer || [];');
    expect(inline?.textContent).toContain("gtag('config', 'G-3YHP7ZY4XV');");
  });

  it('除外パスでは何も描画しない', () => {
    const { container } = renderAt('/tools/chart-author');

    expect(container.querySelectorAll('[data-testid="ga-script"]')).toHaveLength(0);
    expect(container.innerHTML).toBe('');
  });

  it('pathname が null でも描画する', () => {
    const { container } = renderAt(null);

    expect(container.querySelectorAll('[data-testid="ga-script"]')).toHaveLength(2);
  });
});
