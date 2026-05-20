import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

vi.mock('@/lib/db/client', () => ({
  db: { insert: mockInsert },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-migrate-uuid'),
}));

const sampleCommand = () => ({
  id: 'cmd-1',
  mobileSuit: 'ストライクフリーダム',
  name: '波動拳',
  sequence: [{ buttons: ['shot'] }, { buttons: ['melee'] }],
  createdAt: '2026-01-01T00:00:00Z',
});

const samplePracticeLog = () => ({
  commandId: 'cmd-1',
  attempts: [
    { success: true, timestamp: '2026-02-01T10:00:00Z' },
    { success: false, timestamp: '2026-02-01T10:05:00Z' },
  ],
});

describe('POST /api/analytics/migrate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('未認証時は 401 を返す', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { POST } = await import('@/app/api/analytics/migrate/route');

    const body = {
      commands: [sampleCommand()],
      practiceLogs: { 'cmd-1': samplePracticeLog() },
    };

    const req = new Request('http://localhost/api/analytics/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('認証済み: コマンドと練習ログを DB に挿入し { migratedCommands, migratedLogs } を返す', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-abc', name: 'test', email: 'test@example.com', image: null },
    });

    const { POST } = await import('@/app/api/analytics/migrate/route');

    const body = {
      commands: [sampleCommand()],
      practiceLogs: { 'cmd-1': samplePracticeLog() },
    };

    const req = new Request('http://localhost/api/analytics/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.migratedCommands).toBe(1);
    expect(json.migratedLogs).toBe(2);
  });

  it('INSERT OR IGNORE で冪等性を保証する（onConflictDoNothing が呼ばれる）', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-abc', name: 'test', email: 'test@example.com', image: null },
    });

    const { POST } = await import('@/app/api/analytics/migrate/route');

    const body = {
      commands: [sampleCommand()],
      practiceLogs: { 'cmd-1': samplePracticeLog() },
    };

    const req = new Request('http://localhost/api/analytics/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    await POST(req);
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });
});
