import type { SignalKind } from './types';

/**
 * WebRTC の SDP を受け渡すためのメモリ上の置き場。
 *
 * `pnpm dev` の単一プロセスで動かす前提の試作用。サーバーレス環境ではインスタンス間で
 * 共有されないため使えない。HMR でモジュールが読み直されても消えないよう globalThis に置く。
 */
export const SIGNAL_TTL_MS = 10 * 60 * 1000;

type RoomEntry = {
  offer: string | null;
  answer: string | null;
  updatedAt: number;
};

const STORE_KEY = '__exvsInputRelaySignaling';

type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: Map<string, RoomEntry> };

function getStore(): Map<string, RoomEntry> {
  const g = globalThis as GlobalWithStore;
  g[STORE_KEY] ??= new Map();
  return g[STORE_KEY];
}

function sweepExpired(store: Map<string, RoomEntry>, now: number): void {
  for (const [room, entry] of store) {
    if (now - entry.updatedAt > SIGNAL_TTL_MS) store.delete(room);
  }
}

/** offer を置くとそのルームの answer は捨てる（ホストの張り直しで古い answer を拾わないため） */
export function putSignal(room: string, kind: SignalKind, sdp: string, now: number = Date.now()): void {
  const store = getStore();
  sweepExpired(store, now);
  const entry = store.get(room) ?? { offer: null, answer: null, updatedAt: now };
  if (kind === 'offer') {
    entry.offer = sdp;
    entry.answer = null;
  } else {
    entry.answer = sdp;
  }
  entry.updatedAt = now;
  store.set(room, entry);
}

export function getSignal(room: string, kind: SignalKind, now: number = Date.now()): string | null {
  const store = getStore();
  sweepExpired(store, now);
  const entry = store.get(room);
  if (!entry) return null;
  return kind === 'offer' ? entry.offer : entry.answer;
}

/** テスト用 */
export function clearSignalingStore(): void {
  getStore().clear();
}
