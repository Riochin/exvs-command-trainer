'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BackToHomeNav.module.css';

export function BackToHomeNav() {
  const pathname = usePathname();
  // フリー練習とコマンド一覧そのものでは出さない
  if (pathname === '/practice' || pathname === '/commands') {
    return null;
  }
  return (
    <nav className={styles.nav} aria-label="パンくずではないメイン導線">
      <Link href="/commands" className={styles.link}>コマンド一覧に戻る</Link>
    </nav>
  );
}
