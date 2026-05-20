import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

vi.mock('@/lib/db/client', () => ({
  db: { insert: mockInsert },
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-attempt-uuid'),
}));

describe('POST /api/analytics/attempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('試行レコードを作成して { ok: true } を返す', async () => {
    const { POST } = await import('@/app/api/analytics/attempts/route');

    const body = {
      sessionId: 'session-abc',
      clientId: 'client-123',
      userId: null,
      commandId: 'cmd-1',
      attemptIndex: 0,
      success: true,
      stepReached: 3,
      failureStep: null,
      totalDurationMs: 1500,
      stepTimings: [{ step: 0, duration_ms: 500 }, { step: 1, duration_ms: 500 }, { step: 2, duration_ms: 500 }],
      inputSequence: null,
    };

    const req = new Request('http://localhost/api/analytics/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockOnConflictDoNothing).toHaveBeenCalledOnce();
  });

  it('stepTimings を JSON 文字列として保存する', async () => {
    const { POST } = await import('@/app/api/analytics/attempts/route');

    const stepTimings = [{ step: 0, duration_ms: 300 }];
    const body = {
      sessionId: 's1',
      clientId: 'c1',
      userId: null,
      commandId: 'cmd-1',
      attemptIndex: 1,
      success: false,
      stepReached: 1,
      failureStep: 1,
      totalDurationMs: 300,
      stepTimings,
      inputSequence: ['shot'],
    };

    const req = new Request('http://localhost/api/analytics/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    await POST(req);

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.stepTimings).toBe(JSON.stringify(stepTimings));
    expect(insertedValues.inputSequence).toBe(JSON.stringify(['shot']));
    expect(insertedValues.success).toBe(0);
  });

  it('必須フィールド欠損時は 400 を返す', async () => {
    const { POST } = await import('@/app/api/analytics/attempts/route');

    const req = new Request('http://localhost/api/analytics/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'only-this' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
