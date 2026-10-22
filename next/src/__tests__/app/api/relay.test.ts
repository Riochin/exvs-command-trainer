// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('@/lib/db/schema');
  const client = createClient({ url: ':memory:' });
  await client.execute(
    'CREATE TABLE relay_signals (room TEXT PRIMARY KEY, offer TEXT, answer TEXT, updated_at INTEGER NOT NULL)',
  );
  return { db: drizzle(client, { schema }), client };
});

import { GET, POST } from '@/app/api/relay/[room]/route';
import { db } from '@/lib/db/client';
import { relaySignals } from '@/lib/db/schema';

const ctx = (room: string) => ({ params: Promise.resolve({ room }) });

function post(room: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/relay/${room}`, { method: 'POST', body: JSON.stringify(body) }),
    ctx(room),
  );
}

function get(room: string, kind: string) {
  return GET(new Request(`http://localhost/api/relay/${room}?kind=${kind}`), ctx(room));
}

describe('/api/relay/[room]', () => {
  beforeEach(async () => {
    await db.delete(relaySignals);
  });

  it('POST した offer と answer を GET で取り出せる', async () => {
    expect((await post('ABCD', { kind: 'offer', sdp: 'offer-sdp' })).status).toBe(200);
    expect((await post('ABCD', { kind: 'answer', sdp: 'answer-sdp' })).status).toBe(200);
    expect(await (await get('ABCD', 'offer')).json()).toEqual({ sdp: 'offer-sdp' });
    expect(await (await get('ABCD', 'answer')).json()).toEqual({ sdp: 'answer-sdp' });
  });

  it('まだない answer は sdp: null', async () => {
    await post('ABCD', { kind: 'offer', sdp: 'offer-sdp' });
    expect(await (await get('ABCD', 'answer')).json()).toEqual({ sdp: null });
  });

  it('offer のないルームへの answer は 404', async () => {
    expect((await post('WXYZ', { kind: 'answer', sdp: 'answer-sdp' })).status).toBe(404);
  });

  it('不正なルームコードは 400', async () => {
    expect((await get('abcd', 'offer')).status).toBe(400);
    expect((await post('abcd', { kind: 'offer', sdp: 'v=0' })).status).toBe(400);
  });

  it('不正な kind や空の sdp は 400', async () => {
    expect((await get('ABCD', 'candidate')).status).toBe(400);
    expect((await post('ABCD', { kind: 'offer', sdp: '' })).status).toBe(400);
    expect((await post('ABCD', { kind: 'candidate', sdp: 'v=0' })).status).toBe(400);
  });
});
