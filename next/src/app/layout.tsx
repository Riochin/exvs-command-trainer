import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BackToHomeNav } from "@/components/BackToHomeNav";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import { Providers } from "@/components/Providers";
import { AnalyticsPageViewTracker } from "@/features/analytics/AnalyticsPageViewTracker";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {/* Google Analytics */}
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
