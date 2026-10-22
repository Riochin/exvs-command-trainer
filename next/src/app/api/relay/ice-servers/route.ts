import { NextResponse } from 'next/server';

/**
 * 入力リレー試作で使う ICE サーバー。
 *
 * Cloudflare の TURN キーが設定されていれば、短命の資格情報を発行して TURN を含めて返す。
 * 端末同士の通信が制限されたネットワーク（職場・学校の Wi-Fi など）でも中継経由でつながる。
 * 未設定なら STUN だけを返す。
 *
 * GET → { iceServers: RTCIceServer[] }
 */
const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/** 1 回の練習で足りる長さ。漏れても長くは使えないよう短めにする */
const CREDENTIAL_TTL_SECONDS = 2 * 60 * 60;

type IceServer = { urls: string | string[]; username?: string; credential?: string };

function isIceServer(value: unknown): value is IceServer {
  if (typeof value !== 'object' || value === null) return false;
  const { urls } = value as Record<string, unknown>;
  return typeof urls === 'string' || (Array.isArray(urls) && urls.every((u) => typeof u === 'string'));
}

/** ブラウザは 53 番ポートを塞ぐ。non-trickle では待ち時間になるだけなので除く */
function withoutPort53(server: IceServer): IceServer | null {
  const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((u) => !/:53(\?|$)/.test(u));
  return urls.length > 0 ? { ...server, urls } : null;
}

async function fetchCloudflareIceServers(keyId: string, apiToken: string): Promise<IceServer[] | null> {
  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
      cache: 'no-store',
    },
  );
  if (!res.ok) return null;
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null) return null;
  const { iceServers } = body as Record<string, unknown>;
  if (!Array.isArray(iceServers)) return null;
  return iceServers
    .filter(isIceServer)
    .map(withoutPort53)
    .filter((s): s is IceServer => s !== null);
}

export async function GET() {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

  let iceServers: IceServer[] = DEFAULT_ICE_SERVERS;
  if (keyId && apiToken) {
    try {
      iceServers = (await fetchCloudflareIceServers(keyId, apiToken)) ?? DEFAULT_ICE_SERVERS;
    } catch {
      // TURN が取れなくても STUN だけで試せるようにする
    }
  }

  return NextResponse.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}
