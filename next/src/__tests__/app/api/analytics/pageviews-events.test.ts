import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

vi.mock('@/lib/db/client', () => ({
  db: { insert: mockInsert },
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid'),
}));

describe('POST /api/analytics/pageviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('ページビューレコードを作成して { ok: true } を返す', async () => {
    const { POST } = await import('@/app/api/analytics/pageviews/route');

    const body = {
      clientId: 'client-123',
      userId: null,
      path: '/commands',
      referrer: null,
      userAgent: 'Mozilla/5.0',
    };

    const req = new Request('http://localhost/api/analytics/pageviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it('必須フィールド欠損時は 400 を返す', async () => {
    const { POST } = await import('@/app/api/analytics/pageviews/route');

    const req = new Request('http://localhost/api/analytics/pageviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'c1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/analytics/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('イベントレコードを作成して { ok: true } を返す', async () => {
    const { POST } = await import('@/app/api/analytics/events/route');

    const body = {
      clientId: 'client-123',
      userId: 'user-abc',
      eventType: 'command_created',
      payload: { mobileSuit: 'ストライクフリーダム', stepCount: 4 },
    };

    const req = new Request('http://localhost/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it('payload を JSON 文字列として保存する', async () => {
    const { POST } = await import('@/app/api/analytics/events/route');

    const payload = { mobileSuit: 'キュリオス' };
    const body = {
      clientId: 'c1',
      userId: null,
      eventType: 'command_deleted',
      payload,
    };

    const req = new Request('http://localhost/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    await POST(req);

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.payload).toBe(JSON.stringify(payload));
  });

  it('必須フィールド欠損時は 400 を返す', async () => {
    const { POST } = await import('@/app/api/analytics/events/route');

    const req = new Request('http://localhost/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'c1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
