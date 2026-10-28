import { networkInterfaces } from 'node:os';
import { InputRelayHostApp } from '@/features/input-relay/InputRelayHostApp';

/**
 * 3D ビュー（PC 側）。スマホの練習画面とつないで、入力どおりに機体を動かす。
 *
 * 開発中はスマホから開くための LAN 側 IPv4 を並べる（QR コードもこの URL になる）。
 * 本番では内部のアドレスを出さず、ブラウザで開いているこのサイトの URL を使う。
 */
function lanOrigins(): string[] {
  if (process.env.NODE_ENV === 'production') return [];
  const port = process.env.PORT ?? '3000';
  return Object.values(networkInterfaces())
    .flat()
    .filter((info) => info !== undefined && info.family === 'IPv4' && !info.internal)
    .map((info) => `http://${info!.address}:${port}`);
}

export default function ThreeDViewPage() {
  return <InputRelayHostApp lanOrigins={lanOrigins()} />;
}
