'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArcadeRawInput } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';
import { decodeRelayMessage, encodeRelayMessage, isRoomCode } from './protocol';
import { isPeerGone, pollSignal, postSignal, RTC_CONFIGURATION, waitForIceGathering } from './signalingClient';
import type { RelayConnectionState, RelayMessage } from './types';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type OutgoingInput = DistributiveOmit<Extract<RelayMessage, { type: 'raw' | 'button' }>, 'seq' | 't'>;

/**
 * スマホ側。ホストの offer を取りに行って answer を返し、DataChannel で入力を送る。
 *
 * `room` が null（リレーなしの通常の練習）のときは何もしない。送信は判定とは独立で、
 * 未接続のあいだの入力は捨てる。
 */
export function useRelaySender(room: string | null) {
  const [connection, setConnection] = useState<RelayConnectionState>('waiting');
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (room === null || !isRoomCode(room)) return;

    const abort = new AbortController();
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    const setIfActive = (next: RelayConnectionState) => {
      if (!abort.signal.aborted) setConnection(next);
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.onopen = () => {
        channelRef.current = channel;
        setIfActive('connected');
      };
      channel.onclose = () => {
        if (channelRef.current === channel) channelRef.current = null;
        setIfActive('disconnected');
      };
      channel.onmessage = (message: MessageEvent) => {
        const t1 = performance.now();
        const decoded = decodeRelayMessage(message.data);
        if (decoded?.type !== 'ping' || channel.readyState !== 'open') return;
        channel.send(encodeRelayMessage({ type: 'pong', id: decoded.id, t0: decoded.t0, t1 }));
      };
    };

    pc.onconnectionstatechange = () => {
      if (isPeerGone(pc)) setIfActive('disconnected');
    };

    (async () => {
      const offer = await pollSignal(room, 'offer', abort.signal);
      setIfActive('connecting');
      await pc.setRemoteDescription({ type: 'offer', sdp: offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIceGathering(pc);
      const answer = pc.localDescription?.sdp;
      if (!answer) throw new Error('answer を作れませんでした');
      await postSignal(room, 'answer', answer, abort.signal);
    })().catch((e: unknown) => {
      if (abort.signal.aborted) return;
      setConnection('error');
      setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      abort.abort();
      channelRef.current = null;
      pc.close();
    };
  }, [room]);

  const send = useCallback((input: OutgoingInput) => {
    const channel = channelRef.current;
    if (channel === null || channel.readyState !== 'open') return;
    const message = { ...input, seq: ++seqRef.current, t: performance.now() } as RelayMessage;
    channel.send(encodeRelayMessage(message));
  }, []);

  const sendRaw = useCallback((raw: ArcadeRawInput) => send({ type: 'raw', ...raw }), [send]);
  const sendButton = useCallback((button: ButtonType) => send({ type: 'button', button }), [send]);

  return {
    enabled: room !== null,
    connection: room === null ? ('idle' as const) : connection,
    error,
    sendRaw,
    sendButton,
  };
}
