import NextAuth from 'next-auth';
import type { Session } from 'next-auth';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const googleId = profile.sub as string;
        const now = new Date().toISOString();

        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.googleId, googleId));

        let userId: string;
        if (existing.length > 0) {
          userId = existing[0].id;
          await db
            .insert(users)
            .values({
              id: userId,
              googleId,
              name: (profile.name as string) ?? '',
              email: (profile.email as string) ?? '',
              avatarUrl: (profile.picture as string) ?? null,
              createdAt: now,
            })
            .onConflictDoUpdate({
              target: users.googleId,
              set: {
                name: (profile.name as string) ?? '',
                email: (profile.email as string) ?? '',
                avatarUrl: (profile.picture as string) ?? null,
              },
            });
        } else {
          userId = uuidv4();
          await db.insert(users).values({
            id: userId,
            googleId,
            name: (profile.name as string) ?? '',
            email: (profile.email as string) ?? '',
            avatarUrl: (profile.picture as string) ?? null,
            createdAt: now,
          });
        }

        token.userId = userId;
      }
      return token;
    },
    session({ session, token }: { session: Session; token: { userId?: string } & Record<string, unknown> }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
