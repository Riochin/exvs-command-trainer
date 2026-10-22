import { describe, it, expect, beforeEach } from 'vitest';
import { clearSignalingStore, getSignal, putSignal, SIGNAL_TTL_MS } from '@/features/input-relay/signalingStore';

describe('signalingStore', () => {
  beforeEach(() => {
    clearSignalingStore();
  });

  it('置いた offer と answer を取り出せる', () => {
    putSignal('ABCD', 'offer', 'offer-sdp', 0);
    putSignal('ABCD', 'answer', 'answer-sdp', 1);
    expect(getSignal('ABCD', 'offer', 2)).toBe('offer-sdp');
    expect(getSignal('ABCD', 'answer', 2)).toBe('answer-sdp');
  });

  it('未登録のルームは null', () => {
    expect(getSignal('WXYZ', 'offer', 0)).toBeNull();
  });

  it('offer を置き直すと古い answer は消える', () => {
    putSignal('ABCD', 'offer', 'old', 0);
    putSignal('ABCD', 'answer', 'answer-sdp', 1);
    putSignal('ABCD', 'offer', 'new', 2);
    expect(getSignal('ABCD', 'offer', 3)).toBe('new');
    expect(getSignal('ABCD', 'answer', 3)).toBeNull();
  });

  it('TTL を過ぎたルームは破棄される', () => {
    putSignal('ABCD', 'offer', 'offer-sdp', 0);
    expect(getSignal('ABCD', 'offer', SIGNAL_TTL_MS)).toBe('offer-sdp');
    expect(getSignal('ABCD', 'offer', SIGNAL_TTL_MS + 1)).toBeNull();
  });
});
