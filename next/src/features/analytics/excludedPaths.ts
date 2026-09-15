/**
 * 計測を行わないパスの単一定義。
 *
 * ページビュー送信と Google Analytics スクリプトの両方がここを参照する。
 * 判定はプレフィックス一致のみで、正規表現やクエリ文字列は見ない。
 */
export const ANALYTICS_EXCLUDED_PATH_PREFIXES = ['/tools'] as const;

/**
 * 計測対象外のパスなら true。
 *
 * `usePathname()` は null を返しうる。判断できない場合は計測する側に倒す。
 */
export function isAnalyticsExcludedPath(pathname: string | null): boolean {
  if (pathname === null) return false;

  return ANALYTICS_EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
