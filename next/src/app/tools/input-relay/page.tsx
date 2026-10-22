import { networkInterfaces } from 'node:os';
import { InputRelayHostApp } from '@/features/input-relay/InputRelayHostApp';

/**
 * 入力リレー試作の PC 側ルート。主導線のメニューからは辿れない開発者向けの入口。
 *
 * スマホから開くための URL を出すため、開発サーバーの LAN 側 IPv4 を並べる。
 * 本番では内部のアドレスを出さないよう空にする。
 */
function lanOrigins(): string[] {
  if (process.env.NODE_ENV === 'production') return [];
  const port = process.env.PORT ?? '3000';
  return Object.values(networkInterfaces())
    .flat()
    .filter((info) => info !== undefined && info.family === 'IPv4' && !info.internal)
    .map((info) => `http://${info!.address}:${port}`);
}

export default function InputRelayPage() {
  return <InputRelayHostApp lanOrigins={lanOrigins()} />;
}
