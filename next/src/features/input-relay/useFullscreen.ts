'use client';

/**
 * ブラウザのアドレスバーやタブバーを消して画面いっぱいに使うための切り替え。
 *
 * - Android の Chrome や PC は Fullscreen API で全画面にできる（押したときだけ呼ぶ。勝手には切り替えない）
 * - iPhone の Safari（と、中身が同じ WebKit の iPhone 版 Chrome）は普通の要素を全画面にできない。
 *   ホーム画面に追加して開けば manifest の指定どおりバーなしになるので、その案内を出す
 * - すでにホーム画面から開いているなら、ボタンも案内も要らない
 */
import { useCallback, useSyncExternalStore } from 'react';

/** api: 全画面ボタンを出せる / homeScreen: ホーム画面への追加を案内する / installed: ホーム画面から開いている */
export type FullscreenMode = 'api' | 'homeScreen' | 'installed';

const INSTALLED_QUERY = '(display-mode: fullscreen), (display-mode: standalone)';

export function readFullscreenMode(): FullscreenMode {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // 全画面ボタンで全画面にしたときも display-mode: fullscreen になるので、そのときはボタンを残す（戻せるように）
  if (iosStandalone || (window.matchMedia(INSTALLED_QUERY).matches && !document.fullscreenElement)) return 'installed';
  if (document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function') return 'api';
  return 'homeScreen';
}

const subscribe = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
};
const readActive = () => document.fullscreenElement !== null && document.fullscreenElement !== undefined;
const readServerActive = () => false;
// サーバーでは分からないので、ボタンも案内も出さない側に倒す
const readServerMode = (): FullscreenMode => 'installed';

export function useFullscreen() {
  const active = useSyncExternalStore(subscribe, readActive, readServerActive);
  const mode = useSyncExternalStore(subscribe, readFullscreenMode, readServerMode);

  const toggle = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      return;
    }
    // 横向きに固定できる端末（Android の Chrome など）だけ固定する。できなくても全画面のまま使える
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };
    await orientation.lock?.('landscape').catch(() => {});
  }, []);

  return { mode, active, toggle };
}
