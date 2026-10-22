'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArcadeRawInput } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';
import { decodeRelayMessage, encodeRelayMessage, isRoomCode } from './protocol';
import {
  CONNECT_TIMEOUT_MS,
  fetchIceServers,
  isPeerGone,
  P2P_FAILED_MESSAGE,
  pollSignal,
  postSignal,
  RTC_CONFIGURATION,
  waitForIceGathering,
} from './signalingClient';
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

  // ルームを入れ直したら前の接続の状態とエラーを持ち越さない（描画中に揃える React の推奨形）
  const [trackedRoom, setTrackedRoom] = useState(room);
  if (trackedRoom !== room) {
    setTrackedRoom(room);
    setConnection('waiting');
    setError(null);
  }

  useEffect(() => {
    if (room === null || !isRoomCode(room)) return;

    const abort = new AbortController();
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let opened = false;
    const setIfActive = (next: RelayConnectionState) => {
      if (!abort.signal.aborted) setConnection(next);
    };
    const failConnect = () => {
      if (opened || abort.signal.aborted) return;
      setConnection('error');
      setError(P2P_FAILED_MESSAGE);
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.onopen = () => {
        opened = true;
        if (connectTimer !== null) clearTimeout(connectTimer);
        channelRef.current = channel;
        if (!abort.signal.aborted) setError(null);
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
      if (!opened) {
        if (pc.connectionState === 'failed') failConnect();
        return;
      }
      if (isPeerGone(pc)) setIfActive('disconnected');
    };

    (async () => {
      const iceServers = await fetchIceServers(abort.signal);
      const offer = await pollSignal(room, 'offer', abort.signal);
      pc.setConfiguration({ iceServers });
      setIfActive('connecting');
      await pc.setRemoteDescription({ type: 'offer', sdp: offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIceGathering(pc);
      const answer = pc.localDescription?.sdp;
      if (!answer) throw new Error('answer を作れませんでした');
      await postSignal(room, 'answer', answer, abort.signal);
      connectTimer = setTimeout(failConnect, CONNECT_TIMEOUT_MS);
    })().catch((e: unknown) => {
      if (abort.signal.aborted) return;
      setConnection('error');
      setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      abort.abort();
      if (connectTimer !== null) clearTimeout(connectTimer);
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
