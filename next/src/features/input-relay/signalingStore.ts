import { and, eq, gt, lt } from 'drizzle-orm';
import type { DB } from '@/lib/db/client';
import { relaySignals } from '@/lib/db/schema';
import type { SignalKind } from './types';

/**
 * WebRTC の SDP を受け渡すための置き場（Turso）。
 *
 * サーバーレスではリクエストごとに別インスタンスが応答しうるため、メモリではなく DB に置く。
 * 接続時に一度だけ読み書きする一時データなので、TTL を過ぎた行は読まずに捨てる。
 */
export const SIGNAL_TTL_MS = 10 * 60 * 1000;

export type SignalingStore = {
  /** answer は offer のあるルームにしか置けない。置けなかったら false */
  put(room: string, kind: SignalKind, sdp: string): Promise<boolean>;
  get(room: string, kind: SignalKind): Promise<string | null>;
};

export function createSignalingStore(db: DB, now: () => number = Date.now): SignalingStore {
  return {
    async put(room, kind, sdp) {
      const t = now();
      if (kind === 'offer') {
        // 期限切れの行の掃除は、ルームが作られるときだけ行えば十分
        await db.delete(relaySignals).where(lt(relaySignals.updatedAt, t - SIGNAL_TTL_MS));
        // offer を置き直すと古い answer は捨てる（ホストの張り直しで古い answer を拾わないため）
        await db
          .insert(relaySignals)
          .values({ room, offer: sdp, answer: null, updatedAt: t })
          .onConflictDoUpdate({ target: relaySignals.room, set: { offer: sdp, answer: null, updatedAt: t } });
        return true;
      }
      const result = await db
        .update(relaySignals)
        .set({ answer: sdp, updatedAt: t })
        .where(and(eq(relaySignals.room, room), gt(relaySignals.updatedAt, t - SIGNAL_TTL_MS)));
      return result.rowsAffected > 0;
    },

    async get(room, kind) {
      const rows = await db
        .select({ offer: relaySignals.offer, answer: relaySignals.answer })
        .from(relaySignals)
        .where(and(eq(relaySignals.room, room), gt(relaySignals.updatedAt, now() - SIGNAL_TTL_MS)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return (kind === 'offer' ? row.offer : row.answer) ?? null;
    },
  };
}
