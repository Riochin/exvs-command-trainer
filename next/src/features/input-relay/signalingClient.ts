import type { SignalKind } from './types';

/** SDP の取りに行き間隔。接続時に一度だけ待つものなので短めでよい */
export const SIGNAL_POLL_INTERVAL_MS = 500;

/** ICE 候補が出そろうのを待つ上限。LAN 内なら通常は数十 ms で終わる */
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
