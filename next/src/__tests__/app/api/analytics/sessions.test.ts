import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

const mockSet = vi.fn();
const mockWhere = vi.fn().mockResolvedValue(undefined);
mockSet.mockReturnValue({ where: mockWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid-1234'),
}));

describe('POST /api/analytics/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  it('セッションを作成して sessionId を返す', async () => {
    const { POST } = await import('@/app/api/analytics/sessions/route');

    const body = {
      sessionId: 'client-uuid-abc',
      clientId: 'client-id-123',
      userId: null,
      commandId: 'cmd-1',
      commandSnapshot: '{"id":"cmd-1","name":"波動拳"}',
      deviceType: 'mobile',
      startedAt: '2026-05-20T10:00:00Z',
    };

    const req = new Request('http://localhost/api/analytics/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ sessionId: 'client-uuid-abc' });
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockOnConflictDoNothing).toHaveBeenCalledOnce();
  });

  it('必須フィールド欠損時は 400 を返す', async () => {
    const { POST } = await import('@/app/api/analytics/sessions/route');

    const req = new Request('http://localhost/api/analytics/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'only-this' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/analytics/sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  it('セッション終了情報を更新して { ok: true } を返す', async () => {
    const { PATCH } = await import('@/app/api/analytics/sessions/[id]/route');

    const body = {
      endedAt: '2026-05-20T10:10:00Z',
      totalAttempts: 5,
      successCount: 3,
      durationMs: 600000,
      abandoned: false,
      attemptsToFirstSuccess: 2,
      bestAttemptMs: 1500,
    };

    const req = new Request('http://localhost/api/analytics/sessions/session-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const ctx = { params: Promise.resolve({ id: 'session-123' }) };

    const res = await PATCH(req as never, ctx as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockWhere).toHaveBeenCalledOnce();
  });

  it('必須フィールド欠損時は 400 を返す', async () => {
    const { PATCH } = await import('@/app/api/analytics/sessions/[id]/route');

    const req = new Request('http://localhost/api/analytics/sessions/session-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalAttempts: 5 }),
    });

    const ctx = { params: Promise.resolve({ id: 'session-123' }) };

    const res = await PATCH(req as never, ctx as never);
    expect(res.status).toBe(400);
  });
});
