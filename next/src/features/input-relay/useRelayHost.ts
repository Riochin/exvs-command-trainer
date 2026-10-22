'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { estimateClockOffset, oneWayLatency, pushBounded, roundTripTime, type PingSample } from './latencyStats';
import { decodeRelayMessage, encodeRelayMessage, generateRoomCode } from './protocol';
import { isPeerGone, pollSignal, postSignal, RTC_CONFIGURATION, waitForIceGathering } from './signalingClient';
import type { RelayConnectionState, RelayInputMessage } from './types';

export const PING_INTERVAL_MS = 500;
/** オフセット推定と RTT 統計に使う直近の ping 数 */
const PING_SAMPLE_LIMIT = 20;
/** 片道遅延の統計に使う直近の入力数 */
const LATENCY_SAMPLE_LIMIT = 200;
const LOG_LIMIT = 40;

export type RelayLogEntry = {
  message: RelayInputMessage;
  /** ホスト時刻での受信時刻 */
  receivedAt: number;
  /** 時計オフセットが未推定のあいだは null */
  latencyMs: number | null;
};

export type RelayHostState = {
  room: string | null;
  connection: RelayConnectionState;
  error: string | null;
  rttMs: number[];
  latencyMs: number[];
  log: RelayLogEntry[];
  /** seq の飛びから数えた取りこぼし（DataChannel は再送なし設定のため起こりうる） */
  lostCount: number;
};

const INITIAL_STATE: RelayHostState = {
  room: null,
  connection: 'idle',
  error: null,
  rttMs: [],
  latencyMs: [],
  log: [],
  lostCount: 0,
};

/**
 * PC 側。ルームを作って offer を置き、スマホからの answer を待って DataChannel を張る。
 * 接続後は ping で時計を合わせつつ、届いた入力の片道遅延を記録する。
 */
export function useRelayHost() {
  const [state, setState] = useState<RelayHostState>(INITIAL_STATE);
  const [sessionKey, setSessionKey] = useState(0);
  const samplesRef = useRef<PingSample[]>([]);

  const restart = useCallback(() => {
    setState(INITIAL_STATE);
    setSessionKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const room = generateRoomCode();
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    // 遅れた入力を待たない。届かなければ捨てる
    const channel = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 });
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pingId = 0;
    let lastSeq = 0;
    samplesRef.current = [];

    const update = (patch: (prev: RelayHostState) => Partial<RelayHostState>) => {
      if (abort.signal.aborted) return;
      setState((prev) => ({ ...prev, ...patch(prev) }));
    };

    channel.onopen = () => {
      update(() => ({ connection: 'connected' }));
      pingTimer = setInterval(() => {
        if (channel.readyState !== 'open') return;
        channel.send(encodeRelayMessage({ type: 'ping', id: ++pingId, t0: performance.now() }));
      }, PING_INTERVAL_MS);
    };

    channel.onclose = () => update(() => ({ connection: 'disconnected' }));

    channel.onmessage = (event: MessageEvent) => {
      const receivedAt = performance.now();
      const message = decodeRelayMessage(event.data);
      if (message === null) return;

      if (message.type === 'pong') {
        const sample = { t0: message.t0, t1: message.t1, t2: receivedAt };
        samplesRef.current = pushBounded(samplesRef.current, sample, PING_SAMPLE_LIMIT);
        update((prev) => ({ rttMs: pushBounded(prev.rttMs, roundTripTime(sample), PING_SAMPLE_LIMIT) }));
        return;
      }
      if (message.type === 'ping') return;

      const offset = estimateClockOffset(samplesRef.current);
      const latencyMs = offset === null ? null : oneWayLatency(message.t, receivedAt, offset);
      const lost = lastSeq > 0 && message.seq > lastSeq + 1 ? message.seq - lastSeq - 1 : 0;
      lastSeq = Math.max(lastSeq, message.seq);

      update((prev) => ({
        log: pushBounded(prev.log, { message, receivedAt, latencyMs }, LOG_LIMIT),
        latencyMs: latencyMs === null ? prev.latencyMs : pushBounded(prev.latencyMs, latencyMs, LATENCY_SAMPLE_LIMIT),
        lostCount: prev.lostCount + lost,
      }));
    };

    pc.onconnectionstatechange = () => {
      if (isPeerGone(pc)) update(() => ({ connection: 'disconnected' }));
    };

    (async () => {
      await pc.setLocalDescription(await pc.createOffer());
      await waitForIceGathering(pc);
      const offer = pc.localDescription?.sdp;
      if (!offer) throw new Error('offer を作れませんでした');
      await postSignal(room, 'offer', offer, abort.signal);
      // offer を置いてから見せる。先に出すとスマホが空のルームを取りに行く
      update(() => ({ room, connection: 'waiting' }));
      const answer = await pollSignal(room, 'answer', abort.signal);
      update(() => ({ connection: 'connecting' }));
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    })().catch((error: unknown) => {
      if (abort.signal.aborted) return;
      update(() => ({ connection: 'error', error: error instanceof Error ? error.message : String(error) }));
    });

    return () => {
      abort.abort();
      if (pingTimer !== null) clearInterval(pingTimer);
      channel.close();
      pc.close();
    };
  }, [sessionKey]);

  return { ...state, restart };
}
