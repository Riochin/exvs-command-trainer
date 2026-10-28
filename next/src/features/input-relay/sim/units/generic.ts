import { ACTIONS, type ActionDef } from '../actions';
import type { MechAction } from '../types';
import type { UnitDef } from './types';

/** 弾を使うスロットの技。同じ技は毎回同じオブジェクトを返す */
const WITH_AMMO: Partial<Record<MechAction, ActionDef>> = {
  shot: { ...ACTIONS.shot, ammo: 'main' },
  sub: { ...ACTIONS.sub, ammo: 'sub' },
  'special-shot': { ...ACTIONS['special-shot'], ammo: 'beam' },
};

/**
 * 汎用機。レバーに関係なくスロットごとに 1 つの技（`ACTIONS`）を持つ。
 * キャンセルルートは `cancel.ts` の CANCEL_RULES（スロットの標準ルート）を使う。
 */
export const GENERIC_UNIT: UnitDef = {
  id: 'generic',
  name: 'ガンダム（汎用）',
  pilot: '—',
  cost: 2500,
  series: '練習用',
  description: 'BR・ミサイル・太いビーム・サーベルを持つ標準的な機体。',
  boostScale: 1,
  ammo: {
    main: { label: 'BR', max: 7, reload: 3, mode: 'each' },
    sub: { label: 'ミサイル', max: 4, reload: 5, mode: 'each' },
    beam: { label: '太いビーム', max: 1, reload: 8, mode: 'each' },
  },
  resolve: (slot) => WITH_AMMO[slot] ?? ACTIONS[slot],
  look: {
    frame: '#eef0f3',
    chest: '#2546c9',
    accent: '#d8352c',
    trim: '#f2c21a',
    backpack: 'standard',
    meleeWeapon: 'saber',
  },
  commands: [
    { input: '射撃', name: 'ビームライフル（7 発）' },
    { input: '格闘', name: 'サーベル（3 段）' },
    { input: '射撃＋格闘', name: 'サブ：ミサイル', note: 'BR でキャンセルするとアメキャン' },
    { input: '射撃＋ジャンプ', name: '特射：太いビーム' },
    { input: '格闘＋ジャンプ', name: '特格：回転斬り' },
    { input: '射撃長押し', name: '射CS：チャージビーム' },
    { input: '格闘長押し', name: '格CS：突進斬り' },
  ],
  weapons: [
    { ammo: 'main', buttons: ['shot'], charge: 'shot' },
    { ammo: 'sub', buttons: ['shot', 'melee'] },
    { ammo: 'beam', buttons: ['shot', 'jump'] },
    { buttons: ['melee'], charge: 'melee' },
  ],
};
