'use client';

/**
 * スマホ側の PC 連携をアプリ全体で 1 本だけ持つ。
 *
 * ルートレイアウトに置くので、フリー練習 ↔ コマンド練習のような画面移動では接続が切れない。
 * どのページでも URL に `?relay=コード` が付いていればそのルームにつなぐ（PC の QR コードはこの形）。
 * PC 側の 3D 画面そのものでは、スマホとしてはつながない。
 */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import type { ArcadeRawInput } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';
import { isRoomCode } from './protocol';
import { getRelayRoom, getServerRelayRoom, setRelayRoom, subscribeRelayRoom } from './relayRoomStore';
import type { RelayConnectionState } from './types';
import { useRelaySender } from './useRelaySender';

/** PC 側（3D 画面）のページ。ここではスマホとしてつながない。3D 画面はトップ（/）そのもの */
export const HOST_PATHS = ['/'] as const;
export const HOST_PATH_PREFIXES = ['/3d', '/tools'] as const;

export type RelayContextValue = {
  room: string | null;
  connection: RelayConnectionState;
  error: string | null;
  setRoom: (room: string | null) => void;
  sendRaw: (input: ArcadeRawInput) => void;
  sendButton: (button: ButtonType) => void;
};

const RelayContext = createContext<RelayContextValue | null>(null);

/** PC 連携の状態と送信関数。プロバイダの外（テストなど）では null */
export function useRelay(): RelayContextValue | null {
  return useContext(RelayContext);
}

function isHostPath(pathname: string | null): boolean {
  if (pathname === null) return false;
  if ((HOST_PATHS as ReadonlyArray<string>).includes(pathname)) return true;
  return HOST_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function RelayProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const storedRoom = useSyncExternalStore(subscribeRelayRoom, getRelayRoom, getServerRelayRoom);
  const room = isHostPath(pathname) ? null : storedRoom;

  // URL の ?relay= を読み取って置き場に移し、URL からは消す（共有やブックマークにコードを残さない）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('relay');
    if (code === null) return;
    if (isRoomCode(code.toUpperCase())) setRelayRoom(code.toUpperCase());
    params.delete('relay');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [pathname]);

  const relay = useRelaySender(room);
  const value = useMemo<RelayContextValue>(
    () => ({
      room,
      connection: relay.connection,
      error: relay.error,
      setRoom: setRelayRoom,
      sendRaw: relay.sendRaw,
      sendButton: relay.sendButton,
    }),
    [room, relay.connection, relay.error, relay.sendRaw, relay.sendButton],
  );

  return <RelayContext.Provider value={value}>{children}</RelayContext.Provider>;
}
