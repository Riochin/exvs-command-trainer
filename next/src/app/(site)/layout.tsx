import { BackToHomeNav } from "@/components/BackToHomeNav";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import styles from "./layout.module.css";

/**
 * 練習・コマンド・ツールの画面に共通のメニュー。
 * トップ（/）の 3D ビューは画面いっぱいに使うので、ここには入れず設定モーダルからほかの画面へ移る。
 */
export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.frame}>
      <HamburgerMenu />
      <BackToHomeNav />
      {children}
    </div>
  );
}
