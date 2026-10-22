import { NextResponse } from 'next/server';
import { isRoomCode } from '@/features/input-relay/protocol';
import { getSignal, putSignal } from '@/features/input-relay/signalingStore';
import type { SignalKind } from '@/features/input-relay/types';

/**
 * 入力リレー試作の SDP 受け渡し。メモリ保持なので `pnpm dev` の LAN 内専用。
 *
 * GET  ?kind=offer|answer → { sdp: string | null }
 * POST { kind, sdp }      → { ok: true }
 */
type Ctx = { params: Promise<{ room: string }> };

const MAX_SDP_LENGTH = 64 * 1024;

function isSignalKind(value: unknown): value is SignalKind {
  return value === 'offer' || value === 'answer';
}

function disabledInProduction(): NextResponse | null {
  return process.env.NODE_ENV === 'production' ? NextResponse.json({ error: 'Not found' }, { status: 404 }) : null;
}

export async function GET(req: Request, ctx: Ctx) {
  const disabled = disabledInProduction();
  if (disabled) return disabled;

  const { room } = await ctx.params;
  const kind = new URL(req.url).searchParams.get('kind');
  if (!isRoomCode(room) || !isSignalKind(kind)) {
    return NextResponse.json({ error: 'Invalid room or kind' }, { status: 400 });
  }

  return NextResponse.json({ sdp: getSignal(room, kind) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, ctx: Ctx) {
  const disabled = disabledInProduction();
  if (disabled) return disabled;

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

  putSignal(room, kind, sdp);
  return NextResponse.json({ ok: true });
}
