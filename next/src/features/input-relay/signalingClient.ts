import type { SignalKind } from './types';

/**
 * 本番の https ページではブラウザが LAN 内アドレスを mDNS 名で隠すことがあり、
 * 環境によっては名前が解決できず同じ Wi-Fi でもつながらない。STUN で得たアドレスを候補に足して補う。
 */
export const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/**
 * 接続に使う ICE サーバーを取りに行く。
 *
 * サーバー側に TURN が設定されていれば、端末同士が直接つながらないネットワークでも
 * 中継経由でつながる。取れなければ STUN だけで進める。
 */
export async function fetchIceServers(signal?: AbortSignal): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/relay/ice-servers', { cache: 'no-store', signal });
    if (!res.ok) throw new Error(String(res.status));
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'iceServers' in body && Array.isArray(body.iceServers)) {
      return body.iceServers as RTCIceServer[];
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return RTC_CONFIGURATION.iceServers ?? [];
}

/** SDP の交換後、これだけ待っても DataChannel が開かなければ直接つながらないとみなす */
export const CONNECT_TIMEOUT_MS = 15_000;

/** SDP の交換はできたが端末同士がつながらないとき（クライアント分離・UDP 遮断など）の説明 */
export const P2P_FAILED_MESSAGE =
  'PC とスマホが直接つながりませんでした。職場や学校の Wi-Fi など、端末同士の通信が制限されたネットワークの可能性があります';

/** SDP の取りに行き間隔。接続時に一度だけ待つものなので短めでよい */
export const SIGNAL_POLL_INTERVAL_MS = 500;

/** ICE 候補が出そろうのを待つ上限。STUN の応答待ちを含めても通常は 1 秒かからない */
const ICE_GATHERING_TIMEOUT_MS = 3000;

function endpoint(room: string): string {
  return `/api/relay/${encodeURIComponent(room)}`;
}

export async function postSignal(room: string, kind: SignalKind, sdp: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(endpoint(room), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, sdp }),
    signal,
  });
  if (!res.ok) throw new Error(`シグナリングの送信に失敗しました (${res.status})`);
}

export async function fetchSignal(room: string, kind: SignalKind, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${endpoint(room)}?kind=${kind}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`シグナリングの取得に失敗しました (${res.status})`);
  const body: unknown = await res.json();
  if (typeof body === 'object' && body !== null && 'sdp' in body && typeof body.sdp === 'string') {
    return body.sdp;
  }
  return null;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** 相手の SDP が置かれるまで取りに行き続ける */
export async function pollSignal(room: string, kind: SignalKind, signal: AbortSignal): Promise<string> {
  for (;;) {
    const sdp = await fetchSignal(room, kind, signal);
    if (sdp !== null) return sdp;
    await delay(SIGNAL_POLL_INTERVAL_MS, signal);
  }
}

/** つなぎ直しのとき、相手がまだ使っていない（answer の付いていない）offer を待つ間隔 */
export const RECONNECT_DELAY_MS = 800;

/**
 * まだ誰も答えていない新しい offer が置かれるまで待つ。
 *
 * スマホの再読み込みやページ移動のあと、PC が古い接続の終わりに気づいて offer を置き直すまでの間は
 * 古い offer が残っている。それに答えてもつながらないので、answer 済みのものと前回使ったものは飛ばす。
 */
export async function pollFreshOffer(room: string, usedOffer: string | null, signal: AbortSignal): Promise<string> {
  for (;;) {
    const offer = await fetchSignal(room, 'offer', signal);
    if (offer !== null && offer !== usedOffer && (await fetchSignal(room, 'answer', signal)) === null) return offer;
    await delay(SIGNAL_POLL_INTERVAL_MS, signal);
  }
}

/**
 * ICE 候補の収集完了を待つ（non-trickle）。
 *
 * 候補を個別に受け渡さず、出そろった SDP を 1 回だけ送るためのもの。
 * 上限を過ぎたらその時点の候補で進める。
 */
export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, ICE_GATHERING_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

/** 到達しなくなった接続を切断扱いにする */
export function isPeerGone(pc: RTCPeerConnection): boolean {
  return pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed';
}
