import type { ArcadePhysicalButton, ArcadeRawInputPhase } from '@/features/arcade-controller/ArcadeController';
import type { ButtonType } from '@/types';

/**
 * スマホ（送信側）→ PC（ホスト）間で DataChannel に流すメッセージ。
 *
 * `t` は送信側の `performance.now()`。ホストは ping/pong で推定した時計オフセットを足して
 * 自分の時間軸に直し、片道遅延を求める。
 */
export type RelayMessage =
  | { type: 'raw'; seq: number; t: number; button: ArcadePhysicalButton; phase: ArcadeRawInputPhase }
  | { type: 'button'; seq: number; t: number; button: ButtonType }
  /** ホスト → 送信側。t0 はホストの送信時刻 */
  | { type: 'ping'; id: number; t0: number }
  /** 送信側 → ホスト。t1 は送信側が ping を受けた時刻 */
  | { type: 'pong'; id: number; t0: number; t1: number };

export type RelayInputMessage = Extract<RelayMessage, { type: 'raw' | 'button' }>;

export type SignalKind = 'offer' | 'answer';

export type RelayConnectionState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'error';
