import styles from './ChartAuthorApp.module.css';

/**
 * 譜面作成ツールの最上位コンポーネント。
 *
 * アプリ全体が本文スクロールを禁じている（globals.css で html / body を
 * overflow: hidden にしている）ため、ページは高さいっぱいのグリッドとし、
 * 縦に伸びうる領域だけが内部でスクロールする構造をここで用意する。
 */
export function ChartAuthorApp() {
  return (
    <div className={styles.app} data-testid="chart-author-app">
      <header className={styles.header}>
        <h1 className={styles.title}>譜面作成ツール</h1>
        <p className={styles.note}>開発者向け。メニューからは辿れません</p>
      </header>

      <div className={styles.scrollRegion} data-testid="chart-author-scroll-region">
        <p className={styles.placeholder}>動画の読み込みと HUD 校正はこれから実装します</p>
      </div>
    </div>
  );
}
