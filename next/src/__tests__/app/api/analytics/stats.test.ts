import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWhere = vi.fn();
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock('@/lib/db/client', () => ({
  db: { select: mockSelect },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

const sampleAttempt = (commandId: string, success: boolean, failureStep: number | null, durationMs: number, createdAt: string) => ({
  id: 'a-id',
  sessionId: 's-id',
  userId: null,
  clientId: 'client-123',
  commandId,
  attemptIndex: 0,
  success: success ? 1 : 0,
  stepReached: success ? 3 : (failureStep ?? 0),
  failureStep,
  totalDurationMs: durationMs,
  stepTimings: '[]',
  inputSequence: null,
  createdAt,
});

const sampleSession = (commandId: string, commandName: string) => ({
  commandId,
  commandSnapshot: JSON.stringify({ id: commandId, name: commandName }),
});

describe('GET /api/analytics/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it('未認証 + clientId あり: clientId のデータを集計して返す', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    mockWhere
      .mockResolvedValueOnce([
        sampleAttempt('cmd-1', true, null, 1000, '2026-05-20T10:00:00Z'),
        sampleAttempt('cmd-1', false, 2, 800, '2026-05-20T11:00:00Z'),
      ])
      .mockResolvedValueOnce([sampleSession('cmd-1', '波動拳')]);

    const { GET } = await import('@/app/api/analytics/stats/route');

    const req = new Request('http://localhost/api/analytics/stats?clientId=client-123');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.commandStats).toHaveLength(1);
    expect(json.commandStats[0].commandId).toBe('cmd-1');
    expect(json.commandStats[0].commandName).toBe('波動拳');
    expect(json.commandStats[0].totalAttempts).toBe(2);
    expect(json.commandStats[0].successCount).toBe(1);
    expect(json.commandStats[0].successRate).toBe(0.5);
    expect(json.commandStats[0].stepFailureRates).toHaveLength(1);
    expect(json.commandStats[0].stepFailureRates[0].step).toBe(2);
    expect(json.dailyPractice).toHaveLength(1);
    expect(json.dailyPractice[0].date).toBe('2026-05-20');
    expect(json.dailyPractice[0].attemptCount).toBe(2);
  });

  it('未認証 + clientId なし: 空のデータを返す', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import('@/app/api/analytics/stats/route');

    const req = new Request('http://localhost/api/analytics/stats');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ commandStats: [], dailyPractice: [] });
  });

  it('データが存在しない場合でも空のデータ構造を返す（エラーにしない）', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    mockWhere
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/analytics/stats/route');

    const req = new Request('http://localhost/api/analytics/stats?clientId=no-data-client');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ commandStats: [], dailyPractice: [] });
  });
});
