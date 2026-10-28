import { isRoomCode } from './protocol';

/**
 * スマホ側で「いまつないでいる PC のルームコード」を持つ小さな置き場。
 *
 * 画面を移っても、再読み込みしても同じ PC につなぎ直せるよう sessionStorage に残す
 * （タブを閉じれば消える）。React からは useSyncExternalStore で読む。
 */
const STORAGE_KEY = 'input-relay:room';

const listeners = new Set<() => void>();
let loaded = false;
let current: string | null = null;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    current = isRoomCode(stored) ? stored : null;
  } catch {
    current = null;
  }
}

export function getRelayRoom(): string | null {
  if (typeof window === 'undefined') return null;
  load();
  return current;
}

export function getServerRelayRoom(): string | null {
  return null;
}

export function setRelayRoom(room: string | null): void {
  load();
  const next = room !== null && isRoomCode(room) ? room : null;
  if (next === current) return;
  current = next;
  try {
    if (next === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 保存できなくても、このページの間はつながっていられる
  }
  for (const listener of listeners) listener();
}

export function subscribeRelayRoom(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** テスト用 */
export function resetRelayRoomStore(): void {
  loaded = false;
  current = null;
  listeners.clear();
}
