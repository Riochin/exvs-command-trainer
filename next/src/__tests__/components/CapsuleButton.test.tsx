import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CapsuleButton } from '@/components/CapsuleButton';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('CapsuleButton', () => {
  it('デフォルトで primary variant の button をレンダリングする', () => {
    render(<CapsuleButton>テスト</CapsuleButton>);
    const btn = screen.getByRole('button', { name: 'テスト' });
    expect(btn).toBeDefined();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('variant="primary" のとき primary クラスが付与される', () => {
    render(<CapsuleButton variant="primary">テスト</CapsuleButton>);
    const btn = screen.getByRole('button', { name: 'テスト' });
    expect(btn.className).toMatch(/primary/);
  });

  it('variant="danger" のとき danger クラスが付与される', () => {
    render(<CapsuleButton variant="danger">テスト</CapsuleButton>);
    const btn = screen.getByRole('button', { name: 'テスト' });
    expect(btn.className).toMatch(/danger/);
  });

  it('disabled のとき disabled 属性が付与される', () => {
    render(<CapsuleButton disabled>テスト</CapsuleButton>);
    const btn = screen.getByRole('button', { name: 'テスト' });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('href 指定時は <a> タグとしてレンダリングされる', () => {
    render(<CapsuleButton href="/some-path">リンク</CapsuleButton>);
    const link = screen.getByRole('link', { name: 'リンク' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/some-path');
  });

  it('href 未指定時は <button> タグとしてレンダリングされる', () => {
    render(<CapsuleButton>ボタン</CapsuleButton>);
    const btn = screen.getByRole('button', { name: 'ボタン' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('onClick が呼ばれる', () => {
    const handleClick = vi.fn();
    render(<CapsuleButton onClick={handleClick}>クリック</CapsuleButton>);
    fireEvent.click(screen.getByRole('button', { name: 'クリック' }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('size="sm" のとき sm クラスが付与される', () => {
    render(<CapsuleButton size="sm">小</CapsuleButton>);
    const btn = screen.getByRole('button', { name: '小' });
    expect(btn.className).toMatch(/sm/);
  });

  it('size="lg" のとき lg クラスが付与される', () => {
    render(<CapsuleButton size="lg">大</CapsuleButton>);
    const btn = screen.getByRole('button', { name: '大' });
    expect(btn.className).toMatch(/lg/);
  });

  it('className prop が追加される', () => {
    render(<CapsuleButton className="extra">テスト</CapsuleButton>);
    const btn = screen.getByRole('button', { name: 'テスト' });
    expect(btn.className).toContain('extra');
  });
});
