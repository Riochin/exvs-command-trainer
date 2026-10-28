import { networkInterfaces } from 'node:os';
import { redirect } from 'next/navigation';
import { InputRelayHostApp } from '@/features/input-relay/InputRelayHostApp';

/**
 * トップ（/）は 3D ビュー（PC 側）。スマホの練習画面とつないで、入力どおりに機体を動かす。
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 以前の QR コード（/?relay=コード）はスマホ側の練習画面へ送る
  const params = await searchParams;
  if (typeof params.relay === 'string') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') query.set(key, value);
    }
    redirect(`/practice?${query.toString()}`);
  }
  return <InputRelayHostApp lanOrigins={lanOrigins()} />;
}
