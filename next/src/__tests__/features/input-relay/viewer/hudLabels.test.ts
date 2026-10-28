import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/features/input-relay/sim/types';
import { hudLabel } from '@/features/input-relay/viewer/hudLabels';

const route = (label: string): SimEvent => ({ id: 1, kind: 'route', label, time: 0 });
const reject = (label: string): SimEvent => ({ id: 1, kind: 'reject', label, time: 0 });

describe('hudLabel', () => {
  it.each(['ズンダ', 'ズンダ 3発', '慣性ジャンプ', '慣性ジャンプ（入れっぱ）', 'フワステ', '振り向き撃ち', 'アメキャン', 'ステBD'])(
    'ルート「%s」はそのまま出す',
    (label) => {
      expect(hudLabel(route(label))).toBe(label);
    },
  );

  it('SEED発現は「換装」として出す', () => {
    expect(hudLabel(route('SEED発現'))).toBe('換装');
  });

  it.each([
    'ステズンダ',
    'ステズンダ 3発',
    '誘導切り',
    '滑り特射',
    'アサキャン',
    'BDC',
    'ステキャン',
    'サブC',
    '特射C',
    '特格C',
    'CSC',
    '格闘 2段目',
    'ふわふわ',
    'BDステ',
    '動き撃ちステップ',
    'キャンセル落下',
    '知らない技',
  ])('ルート「%s」は出さない', (label) => {
    expect(hudLabel(route(label))).toBeNull();
  });

  it.each(['キャンセル不可', '着地硬直', 'OVERHEAT', '弾切れ', 'チャージ不足'])('理由「%s」は出す', (label) => {
    expect(hudLabel(reject(label))).toBe(label);
  });

  it.each(['ムラサメ展開中', 'オオトリ射出中', 'SEED チャージ中', 'SEED 不可'])('機体固有の理由「%s」は出さない', (label) => {
    expect(hudLabel(reject(label))).toBeNull();
  });
});
