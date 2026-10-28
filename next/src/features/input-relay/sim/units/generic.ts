import { ACTIONS } from '../actions';
import type { UnitDef } from './types';

/**
 * 汎用機。レバーに関係なくスロットごとに 1 つの技（`ACTIONS`）を持ち、弾数の制限がない。
 * キャンセルルートは `cancel.ts` の CANCEL_RULES（スロットの標準ルート）を使う。
 */
export const GENERIC_UNIT: UnitDef = {
  id: 'generic',
  name: 'ガンダム（汎用）',
  pilot: '—',
  cost: 2500,
  series: '練習用',
  description: 'BR・ミサイル・太いビーム・サーベルを持つ標準的な機体。弾数の制限なし。',
  boostScale: 1,
  ammo: {},
  resolve: (slot) => ACTIONS[slot],
  look: {
    frame: '#eef0f3',
    chest: '#2546c9',
    accent: '#d8352c',
    trim: '#f2c21a',
    backpack: 'standard',
    meleeWeapon: 'saber',
  },
  commands: [
    { input: '射撃', name: 'ビームライフル' },
    { input: '格闘', name: 'サーベル（3 段）' },
    { input: '射撃＋格闘', name: 'サブ：ミサイル', note: 'BR でキャンセルするとアメキャン' },
    { input: '射撃＋ジャンプ', name: '特射：太いビーム' },
    { input: '格闘＋ジャンプ', name: '特格：回転斬り' },
    { input: '射撃長押し', name: '射CS：チャージビーム' },
    { input: '格闘長押し', name: '格CS：突進斬り' },
  ],
};
