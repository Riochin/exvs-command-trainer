import type { ArcadePhysicalButton, ArcadeRawInputPhase } from '@/features/arcade-controller/ArcadeController';
import { isButtonType } from '@/types';
import type { RelayMessage } from './types';

const PHYSICAL_BUTTONS = new Set<string>(['shot', 'melee', 'jump']);
const RAW_PHASES = new Set<string>(['down', 'up', 'cancel']);

/** ルームコード。紛らわしい文字（0/O/1/I）を除いた英数字。 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function encodeRelayMessage(message: RelayMessage): string {
  return JSON.stringify(message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 受信データを検証して RelayMessage に戻す。形が合わなければ null。 */
export function decodeRelayMessage(data: unknown): RelayMessage | null {
  if (typeof data !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const m = parsed as Record<string, unknown>;

  switch (m.type) {
    case 'raw':
      if (
        isFiniteNumber(m.seq) &&
        isFiniteNumber(m.t) &&
        typeof m.button === 'string' &&
        PHYSICAL_BUTTONS.has(m.button) &&
        typeof m.phase === 'string' &&
        RAW_PHASES.has(m.phase)
      ) {
        return {
          type: 'raw',
          seq: m.seq,
          t: m.t,
          button: m.button as ArcadePhysicalButton,
          phase: m.phase as ArcadeRawInputPhase,
        };
      }
      return null;
    case 'button':
      if (isFiniteNumber(m.seq) && isFiniteNumber(m.t) && isButtonType(m.button)) {
        return { type: 'button', seq: m.seq, t: m.t, button: m.button };
      }
      return null;
    case 'ping':
      if (isFiniteNumber(m.id) && isFiniteNumber(m.t0)) {
        return { type: 'ping', id: m.id, t0: m.t0 };
      }
      return null;
    case 'pong':
      if (isFiniteNumber(m.id) && isFiniteNumber(m.t0) && isFiniteNumber(m.t1)) {
        return { type: 'pong', id: m.id, t0: m.t0, t1: m.t1 };
      }
      return null;
    default:
      return null;
  }
}
