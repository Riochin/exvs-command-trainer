import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET, POST } from '@/app/api/relay/[room]/route';
import { clearSignalingStore } from '@/features/input-relay/signalingStore';

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
  beforeEach(() => {
    clearSignalingStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('POST した offer を GET で取り出せる', async () => {
    const res = await post('ABCD', { kind: 'offer', sdp: 'v=0' });
    expect(res.status).toBe(200);
    expect(await (await get('ABCD', 'offer')).json()).toEqual({ sdp: 'v=0' });
  });

  it('まだない answer は sdp: null', async () => {
    expect(await (await get('ABCD', 'answer')).json()).toEqual({ sdp: null });
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

  it('本番環境では 404', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await get('ABCD', 'offer')).status).toBe(404);
    expect((await post('ABCD', { kind: 'offer', sdp: 'v=0' })).status).toBe(404);
  });
});
