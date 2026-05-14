'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BackToHomeNav.module.css';

export function BackToHomeNav() {
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/commands') {
    return null;
  }
  return (
    <nav className={styles.nav} aria-label="パンくずではないメイン導線">
      <Link href="/commands" className={styles.link}>コマンド一覧に戻る</Link>
    </nav>
  );
}
