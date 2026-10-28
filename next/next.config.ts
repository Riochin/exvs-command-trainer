import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 入力リレー試作でスマホから LAN IP 経由で開発サーバーを開くため、プライベート IPv4 帯を許可する。
  // 開発サーバーにだけ効く設定で、本番ビルドには影響しない。
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
