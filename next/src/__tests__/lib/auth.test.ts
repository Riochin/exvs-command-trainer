import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('next-auth', () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    _config: config,
  })),
}));

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn(() => ({ id: 'google', name: 'Google' })),
}));

describe('auth.ts', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret';
    process.env.AUTH_GOOGLE_ID = 'test-google-id';
    process.env.AUTH_GOOGLE_SECRET = 'test-google-secret';
  });

  it('handlers・auth・signIn・signOut をエクスポートする', async () => {
    const mod = await import('@/lib/auth');
    expect(mod.handlers).toBeDefined();
    expect(mod.auth).toBeDefined();
    expect(mod.signIn).toBeDefined();
    expect(mod.signOut).toBeDefined();
  });

  it('NextAuth が Google プロバイダーで設定されること', async () => {
    const NextAuth = (await import('next-auth')).default as ReturnType<typeof vi.fn>;
    expect(NextAuth).toHaveBeenCalledOnce();
    const config = NextAuth.mock.calls[0][0] as { providers: unknown[]; callbacks: unknown };
    expect(config.providers).toHaveLength(1);
    expect(config.callbacks).toBeDefined();
  });
});
