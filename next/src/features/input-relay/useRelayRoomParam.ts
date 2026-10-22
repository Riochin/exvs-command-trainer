'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * ルームコードを URL の `?relay=` に書き戻す。
 *
 * 状態を URL に置くので、再読み込みしてもつなぎ直せる。他のクエリ（timeLimit など）は残す。
 */
export function useRelayRoomParam() {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (room: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (room === null) params.delete('relay');
      else params.set('relay', room);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
}
