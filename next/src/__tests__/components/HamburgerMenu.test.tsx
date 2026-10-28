import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HamburgerMenu } from '@/components/HamburgerMenu';

vi.mock('next/navigation', () => ({ usePathname: () => '/commands' }));
vi.mock('@/components/AuthButton', () => ({ AuthButton: () => null }));

describe('HamburgerMenu', () => {
  it('フリー練習は /practice、3D ビューはトップ（/）へ移る', () => {
    render(<HamburgerMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
    expect(screen.getByRole('link', { name: 'フリー練習' }).getAttribute('href')).toBe('/practice');
    expect(screen.getByRole('link', { name: /3Dビュー/ }).getAttribute('href')).toBe('/');
  });
});
