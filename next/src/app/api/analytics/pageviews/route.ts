import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/client';
import { pageViews } from '@/lib/db/schema';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { clientId, userId, path, referrer, userAgent } = body as Record<string, unknown>;

  if (!clientId || !path) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  await db.insert(pageViews).values({
    id: uuidv4(),
    clientId: clientId as string,
    userId: (userId as string) ?? null,
    path: path as string,
    referrer: (referrer as string) ?? null,
    userAgent: (userAgent as string) ?? null,
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
