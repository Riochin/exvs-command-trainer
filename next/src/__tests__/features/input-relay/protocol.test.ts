import { describe, it, expect } from 'vitest';
import {
  decodeRelayMessage,
  encodeRelayMessage,
  generateRoomCode,
  isRoomCode,
  ROOM_CODE_LENGTH,
} from '@/features/input-relay/protocol';
import type { RelayMessage } from '@/features/input-relay/types';

describe('input-relay protocol', () => {
  const messages: RelayMessage[] = [
    { type: 'raw', seq: 1, t: 12.5, button: 'shot', phase: 'down' },
    { type: 'button', seq: 2, t: 30, button: 'special-melee' },
    { type: 'ping', id: 3, t0: 100 },
    { type: 'pong', id: 3, t0: 100, t1: 52.25 },
  ];

  it.each(messages)('$type をエンコードしてデコードすると元に戻る', (message) => {
    expect(decodeRelayMessage(encodeRelayMessage(message))).toEqual(message);
  });

  it.each([
    ['文字列でない', 42],
    ['JSON でない', '{not json'],
    ['null', 'null'],
    ['未知の type', '{"type":"hello"}'],
    ['物理ボタン以外の raw', '{"type":"raw","seq":1,"t":0,"button":"bd","phase":"down"}'],
    ['未知の phase', '{"type":"raw","seq":1,"t":0,"button":"shot","phase":"hold"}'],
    ['未知の ButtonType', '{"type":"button","seq":1,"t":0,"button":"burst"}'],
    ['数値でない t', '{"type":"button","seq":1,"t":"0","button":"shot"}'],
    ['t1 のない pong', '{"type":"pong","id":1,"t0":0}'],
  ])('%s は null を返す', (_label, data) => {
    expect(decodeRelayMessage(data)).toBeNull();
  });

  it('余分なフィールドは落とす', () => {
    expect(decodeRelayMessage('{"type":"ping","id":1,"t0":2,"extra":true}')).toEqual({ type: 'ping', id: 1, t0: 2 });
  });

  it('生成したルームコードは検証を通る', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect(isRoomCode(code)).toBe(true);
  });

  it.each(['', 'abcd', 'AB0D', 'ABCDE', 'AB1D'])('"%s" はルームコードではない', (value) => {
    expect(isRoomCode(value)).toBe(false);
  });
});
