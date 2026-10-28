'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { estimateClockOffset, oneWayLatency, pushBounded, roundTripTime, type PingSample } from './latencyStats';
import { decodeRelayMessage, encodeRelayMessage, generateRoomCode, isRoomCode } from './protocol';
import {
  CONNECT_TIMEOUT_MS,
  fetchIceServers,
  isPeerGone,
  P2P_FAILED_MESSAGE,
  pollSignal,
  postSignal,
  RECONNECT_DELAY_MS,
  RTC_CONFIGURATION,
  waitForIceGathering,
} from './signalingClient';
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
const HOST_ROOM_KEY = 'input-relay:host-room';

function loadHostRoom(): string | null {
  try {
    const stored = window.sessionStorage.getItem(HOST_ROOM_KEY);
    return isRoomCode(stored) ? stored : null;
  } catch {
    return null;
  }
}

function saveHostRoom(room: string | null): void {
  try {
    if (room === null) window.sessionStorage.removeItem(HOST_ROOM_KEY);
    else window.sessionStorage.setItem(HOST_ROOM_KEY, room);
  } catch {
    // 保存できなくても、このページの間は同じコードで待ち受けられる
  }
}

export type UseRelayHostOptions = {
  /** 入力が届いた瞬間に呼ぶ（3D ビューの sim に即座に渡すため。React の再描画を待たない） */
  onInput?: (message: RelayInputMessage) => void;
};

export function useRelayHost({ onInput }: UseRelayHostOptions = {}) {
  const [state, setState] = useState<RelayHostState>(INITIAL_STATE);
  const onInputRef = useRef(onInput);
  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);
  const [sessionKey, setSessionKey] = useState(0);
  const samplesRef = useRef<PingSample[]>([]);
  // つなぎ直しでは同じルームコードを使い続け、スマホ側が入れ直さなくて済むようにする
  const roomRef = useRef<string | null>(null);

  /** 新しいルームコードで最初からやり直す */
  const restart = useCallback(() => {
    roomRef.current = null;
    saveHostRoom(null);
    setState(INITIAL_STATE);
    setSessionKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    // PC を再読み込みしても同じコードを使い、スマホがそのままつながり直せるようにする
    const room = roomRef.current ?? loadHostRoom() ?? generateRoomCode();
    roomRef.current = room;
    saveHostRoom(room);
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    // 遅れた入力を待たない。届かなければ捨てる
    const channel = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 });
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;
    let opened = false;
    let pingId = 0;
    let lastSeq = 0;
    samplesRef.current = [];

    const update = (patch: (prev: RelayHostState) => Partial<RelayHostState>) => {
      if (abort.signal.aborted) return;
      setState((prev) => ({ ...prev, ...patch(prev) }));
    };

    /**
     * 切れたりつながらなかったりしたら、同じルームで offer を置き直してスマホを待つ。
     * スマホの再読み込みや画面移動のあとも、コードを入れ直さずにつながり直せる。
     */
    const renew = (patch: Partial<RelayHostState>) => {
      update(() => patch);
      if (renewTimer !== null || abort.signal.aborted) return;
      renewTimer = setTimeout(() => {
        if (!abort.signal.aborted) setSessionKey((k) => k + 1);
      }, RECONNECT_DELAY_MS);
    };

    const failConnect = () => {
      if (!opened) renew({ connection: 'error', error: P2P_FAILED_MESSAGE });
    };

    channel.onopen = () => {
      opened = true;
      if (connectTimer !== null) clearTimeout(connectTimer);
      update(() => ({ connection: 'connected', error: null }));
      pingTimer = setInterval(() => {
        if (channel.readyState !== 'open') return;
        channel.send(encodeRelayMessage({ type: 'ping', id: ++pingId, t0: performance.now() }));
      }, PING_INTERVAL_MS);
    };

    channel.onclose = () => {
      if (opened) renew({ connection: 'disconnected' });
    };

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
      onInputRef.current?.(message);

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
      if (!opened) {
        if (pc.connectionState === 'failed') failConnect();
        return;
      }
      if (isPeerGone(pc)) renew({ connection: 'disconnected' });
    };

    (async () => {
      // ICE の収集は setLocalDescription から始まるので、その前なら差し替えられる
      pc.setConfiguration({ iceServers: await fetchIceServers(abort.signal) });
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
      connectTimer = setTimeout(failConnect, CONNECT_TIMEOUT_MS);
    })().catch((error: unknown) => {
      if (abort.signal.aborted) return;
      renew({ connection: 'error', error: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      abort.abort();
      if (pingTimer !== null) clearInterval(pingTimer);
      if (connectTimer !== null) clearTimeout(connectTimer);
      if (renewTimer !== null) clearTimeout(renewTimer);
      channel.close();
      pc.close();
    };
  }, [sessionKey]);

  return { ...state, restart };
}
