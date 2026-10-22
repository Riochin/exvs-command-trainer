// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { createSignalingStore, SIGNAL_TTL_MS, type SignalingStore } from '@/features/input-relay/signalingStore';

describe('signalingStore', () => {
  let clock: number;
  let store: SignalingStore;

  beforeEach(async () => {
    const client = createClient({ url: ':memory:' });
    await client.execute(
      'CREATE TABLE relay_signals (room TEXT PRIMARY KEY, offer TEXT, answer TEXT, updated_at INTEGER NOT NULL)',
    );
    clock = 0;
    store = createSignalingStore(drizzle(client, { schema }), () => clock);
  });

  it('置いた offer と answer を取り出せる', async () => {
    await store.put('ABCD', 'offer', 'offer-sdp');
    clock = 1;
    expect(await store.put('ABCD', 'answer', 'answer-sdp')).toBe(true);
    expect(await store.get('ABCD', 'offer')).toBe('offer-sdp');
    expect(await store.get('ABCD', 'answer')).toBe('answer-sdp');
  });

  it('未登録のルームは null', async () => {
    expect(await store.get('WXYZ', 'offer')).toBeNull();
  });

  it('offer のないルームには answer を置けない', async () => {
    expect(await store.put('WXYZ', 'answer', 'answer-sdp')).toBe(false);
    expect(await store.get('WXYZ', 'answer')).toBeNull();
  });

  it('offer を置き直すと古い answer は消える', async () => {
    await store.put('ABCD', 'offer', 'old');
    await store.put('ABCD', 'answer', 'answer-sdp');
    await store.put('ABCD', 'offer', 'new');
    expect(await store.get('ABCD', 'offer')).toBe('new');
    expect(await store.get('ABCD', 'answer')).toBeNull();
  });

  it('TTL を過ぎたルームは読めず、answer も置けない', async () => {
    await store.put('ABCD', 'offer', 'offer-sdp');
    clock = SIGNAL_TTL_MS - 1;
    expect(await store.get('ABCD', 'offer')).toBe('offer-sdp');
    clock = SIGNAL_TTL_MS + 1;
    expect(await store.get('ABCD', 'offer')).toBeNull();
    expect(await store.put('ABCD', 'answer', 'answer-sdp')).toBe(false);
  });

  it('新しいルームを作るときに期限切れの行を消す', async () => {
    await store.put('ABCD', 'offer', 'old-room');
    clock = SIGNAL_TTL_MS + 1;
    await store.put('WXYZ', 'offer', 'new-room');
    clock = 0;
    expect(await store.get('ABCD', 'offer')).toBeNull();
  });
});
