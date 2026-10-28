import { describe, it, expect } from 'vitest';
import { joinUrl } from '@/features/input-relay/JoinQrCode';

describe('joinUrl', () => {
  it('スマホ側のフリー練習（/practice）を開いてつなぐ URL にする', () => {
    expect(joinUrl('https://example.com', 'ABCD')).toBe('https://example.com/practice?relay=ABCD');
  });
});
