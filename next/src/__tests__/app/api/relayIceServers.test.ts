// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from '@/app/api/relay/ice-servers/route';

describe('GET /api/relay/ice-servers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('TURN キーが未設定なら STUN だけを返す', async () => {
    vi.stubEnv('CLOUDFLARE_TURN_KEY_ID', '');
    vi.stubEnv('CLOUDFLARE_TURN_API_TOKEN', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const body = await (await GET()).json();
    expect(body).toEqual({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('TURN キーがあれば Cloudflare から発行し、53 番ポートの URL を除く', async () => {
    vi.stubEnv('CLOUDFLARE_TURN_KEY_ID', 'key-id');
    vi.stubEnv('CLOUDFLARE_TURN_API_TOKEN', 'token');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          iceServers: [
            { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
            {
              urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp'],
              username: 'u',
              credential: 'c',
            },
          ],
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const body = await (await GET()).json();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
    );
    expect(body).toEqual({
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' },
      ],
    });
  });

  it('Cloudflare が失敗したら STUN だけで返す', async () => {
    vi.stubEnv('CLOUDFLARE_TURN_KEY_ID', 'key-id');
    vi.stubEnv('CLOUDFLARE_TURN_API_TOKEN', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));

    const body = await (await GET()).json();
    expect(body).toEqual({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  });
});
