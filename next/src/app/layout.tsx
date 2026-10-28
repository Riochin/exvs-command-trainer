import type { Metadata } from "next";
import { M_PLUS_1, M_PLUS_1_Code } from "next/font/google";
import { Providers } from "@/components/Providers";
import { AnalyticsPageViewTracker } from "@/features/analytics/AnalyticsPageViewTracker";
import { GoogleAnalyticsScripts } from "@/features/analytics/GoogleAnalyticsScripts";
import "./globals.css";

// 日本語フォントはサブセット指定ができないため preload しない
const mplus = M_PLUS_1({
  variable: "--font-mplus",
  weight: ["400", "500", "700", "800"],
  preload: false,
  display: "swap",
});

const mplusCode = M_PLUS_1_Code({
  variable: "--font-mplus-code",
  weight: ["500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EXVSコマンド道場",
  description: "機動戦士ガンダム EXTREME VS.のコマンドを練習・確認できるWebアプリ。3D ビューでスマホの入力どおりに機体を動かせるほか、コマンドの登録・編集・練習モードを搭載。",
  metadataBase: new URL("https://exvs-command-trainer.vercel.app"),
  openGraph: {
    title: "EXVSコマンド道場",
    description: "機動戦士ガンダム EXTREME VS.のコマンドを練習・確認できるWebアプリ。3D ビューでスマホの入力どおりに機体を動かせるほか、コマンドの登録・編集・練習モードを搭載。",
    images: [{ url: "/ogp.png", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EXVSコマンド道場",
    description: "機動戦士ガンダム EXTREME VS.のコマンドを練習・確認できるWebアプリ。3D ビューでスマホの入力どおりに機体を動かせるほか、コマンドの登録・編集・練習モードを搭載。",
    images: ["/ogp.png"],
  },
  icons: {
    icon: "/favicon.ico",
  },
  other: {
    "google-site-verification":
    "thDPYfsByvt8fIWF72-54d59tsSdBF-oPTsN41Yp5Vs",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${mplus.variable} ${mplusCode.variable}`}>
      <body>
        {/* Google Analytics */}
        <GoogleAnalyticsScripts />

        <Providers>
          <AnalyticsPageViewTracker />
          {children}
        </Providers>
      </body>
    </html>
  );
}
