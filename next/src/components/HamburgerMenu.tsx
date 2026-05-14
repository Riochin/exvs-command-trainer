'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './HamburgerMenu.module.css';

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = () => setOpen(false);

  return (
    <>
      <div className={styles.wrapper}>
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={open}
        >
          <span className={`${styles.bar} ${open ? styles.barOpen1 : ''}`} />
          <span className={`${styles.bar} ${open ? styles.barOpen2 : ''}`} />
          <span className={`${styles.bar} ${open ? styles.barOpen3 : ''}`} />
        </button>

        {open && (
          <nav className={styles.menu} aria-label="メインメニュー">
            <Link
              href="/commands/new"
              className={`${styles.item} ${pathname === '/commands/new' ? styles.active : ''}`}
              onClick={close}
            >
              コマンドを登録する
            </Link>
            <Link
              href="/commands"
              className={`${styles.item} ${pathname === '/commands' ? styles.active : ''}`}
              onClick={close}
            >
              コマンドを練習する
            </Link>
          </nav>
        )}
      </div>

      {open && (
        <div className={styles.overlay} onClick={close} aria-hidden="true" />
      )}
    </>
  );
}
