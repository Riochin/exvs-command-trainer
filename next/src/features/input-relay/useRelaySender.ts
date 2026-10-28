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
  pollFreshOffer,
  postSignal,
  RECONNECT_DELAY_MS,
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
 * 未接続のあいだの入力は捨てる。切れたら自動でつなぎ直す。
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
    let pc: RTCPeerConnection | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // 前回答えた offer。つなぎ直しでは、PC が置き直した新しい offer を待つ
    let usedOffer: string | null = null;

    const clearTimers = () => {
      if (connectTimer !== null) clearTimeout(connectTimer);
      if (retryTimer !== null) clearTimeout(retryTimer);
      connectTimer = null;
      retryTimer = null;
    };

    /**
     * 切れたりつながらなかったりしたら、少し待ってから最初からやり直す。
     * PC の再読み込みや、スマホ側の画面移動のあとでも、そのままつながり直す。
     */
    const scheduleRetry = (reason: string | null) => {
      if (abort.signal.aborted) return;
      clearTimers();
      channelRef.current = null;
      pc?.close();
      pc = null;
      setConnection('waiting');
      if (reason !== null) setError(reason);
      retryTimer = setTimeout(attempt, RECONNECT_DELAY_MS);
    };

    const attempt = () => {
      if (abort.signal.aborted) return;
      const current = new RTCPeerConnection(RTC_CONFIGURATION);
      pc = current;
      let opened = false;

      current.ondatachannel = (event) => {
        const channel = event.channel;
        channel.onopen = () => {
          opened = true;
          if (connectTimer !== null) clearTimeout(connectTimer);
          channelRef.current = channel;
          if (abort.signal.aborted) return;
          setError(null);
          setConnection('connected');
        };
        channel.onclose = () => {
          if (pc === current) scheduleRetry(null);
        };
        channel.onmessage = (message: MessageEvent) => {
          const t1 = performance.now();
          const decoded = decodeRelayMessage(message.data);
          if (decoded?.type !== 'ping' || channel.readyState !== 'open') return;
          channel.send(encodeRelayMessage({ type: 'pong', id: decoded.id, t0: decoded.t0, t1 }));
        };
      };

      current.onconnectionstatechange = () => {
        if (pc !== current) return;
        if (!opened && current.connectionState === 'failed') scheduleRetry(P2P_FAILED_MESSAGE);
        else if (opened && isPeerGone(current)) scheduleRetry(null);
      };

      (async () => {
        const iceServers = await fetchIceServers(abort.signal);
        const offer = await pollFreshOffer(room, usedOffer, abort.signal);
        usedOffer = offer;
        current.setConfiguration({ iceServers });
        if (!abort.signal.aborted) setConnection('connecting');
        await current.setRemoteDescription({ type: 'offer', sdp: offer });
        await current.setLocalDescription(await current.createAnswer());
        await waitForIceGathering(current);
        const answer = current.localDescription?.sdp;
        if (!answer) throw new Error('answer を作れませんでした');
        await postSignal(room, 'answer', answer, abort.signal);
        connectTimer = setTimeout(() => {
          if (!opened && pc === current) scheduleRetry(P2P_FAILED_MESSAGE);
        }, CONNECT_TIMEOUT_MS);
      })().catch((e: unknown) => {
        if (abort.signal.aborted || pc !== current) return;
        scheduleRetry(e instanceof Error ? e.message : String(e));
      });
    };

    attempt();

    return () => {
      abort.abort();
      clearTimers();
      channelRef.current = null;
      pc?.close();
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
