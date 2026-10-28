import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { isRoomCode } from '@/features/input-relay/protocol';
import { createSignalingStore } from '@/features/input-relay/signalingStore';
import type { SignalKind } from '@/features/input-relay/types';

/**
 * 入力リレー試作の SDP 受け渡し。
 *
 * GET  ?kind=offer|answer → { sdp: string | null }
 * POST { kind, sdp }      → { ok: true }（offer のないルームへの answer は 404）
 */
type Ctx = { params: Promise<{ room: string }> };

const MAX_SDP_LENGTH = 64 * 1024;

const store = createSignalingStore(db);

function isSignalKind(value: unknown): value is SignalKind {
  return value === 'offer' || value === 'answer';
}

export async function GET(req: Request, ctx: Ctx) {
  const { room } = await ctx.params;
  const kind = new URL(req.url).searchParams.get('kind');
  if (!isRoomCode(room) || !isSignalKind(kind)) {
    return NextResponse.json({ error: 'Invalid room or kind' }, { status: 400 });
  }

  return NextResponse.json({ sdp: await store.get(room, kind) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, ctx: Ctx) {
  const { room } = await ctx.params;
  if (!isRoomCode(room)) {
    return NextResponse.json({ error: 'Invalid room' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { kind, sdp } = body;
  if (!isSignalKind(kind) || typeof sdp !== 'string' || sdp.length === 0 || sdp.length > MAX_SDP_LENGTH) {
    return NextResponse.json({ error: 'Invalid kind or sdp' }, { status: 400 });
  }

  if (!(await store.put(room, kind, sdp))) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
