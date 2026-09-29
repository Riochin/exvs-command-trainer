import type { Metadata } from "next";
import { Oswald, Share_Tech_Mono, Zen_Kaku_Gothic_New } from "next/font/google";
import { BackToHomeNav } from "@/components/BackToHomeNav";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import { Providers } from "@/components/Providers";
import { AnalyticsPageViewTracker } from "@/features/analytics/AnalyticsPageViewTracker";
import { GoogleAnalyticsScripts } from "@/features/analytics/GoogleAnalyticsScripts";
import "./globals.css";

// 日本語フォントはサブセット指定ができないため preload しない
const zenKaku = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku",
  weight: ["500", "700", "900"],
  preload: false,
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
});

const shareTechMono = Share_Tech_Mono({
  variable: "--font-share-tech-mono",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EXVSコマンド道場",
  description: "機動戦士ガンダム EXTREME VS.のコマンドを練習・確認できるWebアプリ。コマンドの登録・編集・練習モードを搭載。",
  metadataBase: new URL("https://exvs-command-trainer.vercel.app"),
  openGraph: {
    title: "EXVSコマンド道場",
    description: "機動戦士ガンダム EXTREME VS.のコマンドを練習・確認できるWebアプリ。コマンドの登録・編集・練習モードを搭載。",
    images: [{ url: "/ogp.png", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EXVSコマンド道場",
    description: "機動戦士ガンダム EXTREME VS.のコマンドを練習・確認できるWebアプリ。コマンドの登録・編集・練習モードを搭載。",
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
    <html lang="ja" className={`${zenKaku.variable} ${oswald.variable} ${shareTechMono.variable}`}>
      <body>
        {/* Google Analytics */}
        <GoogleAnalyticsScripts />

        <Providers>
          <AnalyticsPageViewTracker />
          <HamburgerMenu />
          <BackToHomeNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
