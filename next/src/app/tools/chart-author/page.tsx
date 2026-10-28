import { ChartAuthorApp } from '@/features/chart-author/ChartAuthorApp';

/**
 * 譜面作成ツールの専用ルート。
 *
 * 主導線のメニューからは辿れない開発者向けの入口。練習画面と違い
 * 横画面ガードで包まないため、縦向きでも操作できる。
 */
export default function ChartAuthorPage() {
  return <ChartAuthorApp />;
}
