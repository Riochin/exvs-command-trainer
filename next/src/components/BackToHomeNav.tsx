'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function BackToHomeNav() {
  const pathname = usePathname();
  if (pathname === '/') {
    return null;
  }
  return (
    <nav aria-label="パンくずではないメイン導線">
      <Link href="/">コマンド一覧に戻る</Link>
    </nav>
  );
}
