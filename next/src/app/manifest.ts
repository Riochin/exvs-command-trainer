import type { MetadataRoute } from 'next';

/**
 * ホーム画面に追加したとき、ブラウザのアドレスバーやタブバーなしで開くための manifest。
 * 練習も 3D ビューも横向きで使うので、向きは横に固定する。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EXVSコマンド道場',
    short_name: 'EXVS道場',
    description: '機動戦士ガンダム EXTREME VS.のコマンドを練習・確認できるWebアプリ',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    // fullscreen に対応しないブラウザでは standalone（バーなしの単独ウィンドウ）で開く
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    background_color: '#000000',
    theme_color: '#000000',
    lang: 'ja',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
