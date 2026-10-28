'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { isAnalyticsExcludedPath } from './excludedPaths';

/**
 * Google Analytics のスクリプトを保持する。
 *
 * 現在のパスを判定するためだけのクライアント境界。除外パスでは何も描画せず、
 * それ以外での出力内容は root layout に直書きしていた頃と同一に保つ。
 */
export function GoogleAnalyticsScripts() {
  const pathname = usePathname();

  if (isAnalyticsExcludedPath(pathname)) return null;

  return (
    <>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-3YHP7ZY4XV"
        strategy="afterInteractive"
      />
      <Script id="ga-gtag" strategy="afterInteractive">
        {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-3YHP7ZY4XV');
          `}
      </Script>
    </>
  );
}
