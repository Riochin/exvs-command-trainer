import type { ActionDef, AssistKind } from '../actions';
import type { ActionKind, MechAction } from '../types';

/**
 * 機体データの型。スロット（射撃・格闘・サブ……）とレバーの入れ方から、実際に出す技を決める。
 *
 * 威力やダウン値は扱わず、動き・つながり・弾数だけを再現する。
 * 機体の足し方は `.kiro/steering/unit-authoring.md` を参照。
 */

/** レバーの入れ方。前は敵の方向 */
export type LeverKind = 'N' | 'front' | 'side' | 'back';

export type ResolveContext = {
  lever: LeverKind;
  /** BD 中に出したか（BD 格闘の判定） */
  inBd: boolean;
  /** 時限強化中か */
  seed: boolean;
  /** 背中の装備を射出しているか */
  packOut: boolean;
  /** 時限強化をまた使えるようになるまでの残り（秒） */
  seedCooldown: number;
  /** 出ているアシストの種類（追従アシストの展開中かどうかなど） */
  assists: ReadonlyArray<AssistKind>;
  /** 今出している技（格闘の追加入力や派生の判定に使う） */
  current: ActionDef | null;
  currentSlot: ActionKind;
};

/** 出せない理由。HUD に出す */
export type Rejection = { reject: string };

export type AmmoDef = {
  /** HUD に出す名前 */
  label: string;
  max: number;
  /** 1 発（empty なら全弾）が戻るまでの秒数 */
  reload: number;
  /** each: 1 発ずつ戻る / empty: 撃ち切ってから全弾戻る */
  mode: 'each' | 'empty';
  /** 時限強化中のリロード秒数 */
  seedReload?: number;
  /** 時限強化を発動したときに全弾戻る */
  refillOnSeed?: boolean;
  /** 射出した装備が戻ってくるまでリロードしない */
  waitsForPack?: boolean;
  /** このアシストが出ているあいだはリロードしない（消えてからリロードを始める） */
  waitsForAssists?: ReadonlyArray<AssistKind>;
};

/**
 * 背中の装備。モデルは `viewer/parts/equipment.tsx` の BACKPACKS に置く。
 * 増やすときはここに名前を足し、BACKPACKS にモデルを足す（足し忘れると型エラーになる）
 */
export type BackpackKind = 'standard' | 'ootori';

/** 格闘武器。モデルは `viewer/parts/equipment.tsx` の MELEE_WEAPONS に置く */
export type MeleeWeaponKind = 'saber' | 'blade';

export type UnitLook = {
  /** 手足など外装の色 */
  frame: string;
  /** 胸の色 */
  chest: string;
  /** 腰・足先・肩などの差し色 */
  accent: string;
  /** アンテナ・ダクトの色 */
  trim: string;
  backpack: BackpackKind;
  meleeWeapon: MeleeWeaponKind;
};

/** 押すボタン。HUD の武装パネルの左に、この順（射撃・格闘・ジャンプ）で並ぶ */
export type WeaponButton = 'shot' | 'melee' | 'jump';

/**
 * 画面右下に出す武装パネルの 1 行。上から並べた順に出す。
 * 弾を使わない技でも、チャージ技（格闘 CS など）は行を作る。
 */
export type WeaponPanelDef = {
  /** 使う弾（`ammo` のキー）。弾がない行は省く */
  ammo?: string;
  /** 押すボタン。サブなら ['shot', 'melee'] */
  buttons: ReadonlyArray<WeaponButton>;
  /** レバーの入れ方が要る技（後格など）。N なら省く */
  lever?: Exclude<LeverKind, 'N'>;
  /**
   * この行に出すチャージ。射撃 CS はメインの行に 2 段目のゲージとして、
   * 格闘 CS は専用の行に出す（コマンドの上に CHARGE! が付く）
   */
  charge?: 'shot' | 'melee';
  /** 時限強化中だけ出す行（オメガ中の鞭など） */
  onlyInSeed?: boolean;
};

/** チャージ時間の標準（秒）。機体の chargeTime で上書きする */
export const DEFAULT_CHARGE_TIME = 2;

/** 技表の 1 行。機体選択の画面に出す */
export type CommandRow = { input: string; name: string; note?: string };

export type UnitDef = {
  /** URL や保存に使う識別子。kebab-case（例: strike-rouge-ootori） */
  id: string;
  name: string;
  pilot: string;
  cost: number;
  series: string;
  description: string;
  /** ブースト消費の倍率。BD 回数が多い機体ほど小さい（汎用機の 4 回が 1） */
  boostScale: number;
  /** 時限強化中のブースト消費倍率と移動速度の倍率 */
  seedBoostScale?: number;
  seedSpeedScale?: number;
  /** 時限強化の長さと、終わってからまた使えるまでの秒数 */
  seedDuration?: number;
  seedCooldown?: number;
  /**
   * 射撃 CS・格闘 CS が溜まるまでの秒数（チャージ開始から）。省略時は DEFAULT_CHARGE_TIME。
   * 満タン前に離すと CS は出ない
   */
  chargeTime?: { shot?: number; melee?: number };
  /**
   * 盾（レバー後→前のシールドガード）を出せるか。wiki の基本情報の「盾コマンド あり / なし」を写す。
   * 盾を持たない機体でも、盾コマンドがあれば腕で防ぐ
   */
  shieldGuard: boolean;
  /** 弾の定義。キーは ActionDef.ammo に書く名前 */
  ammo: Readonly<Record<string, AmmoDef>>;
  /** スロットと状況から技を決める。出せなければ理由を返す */
  resolve(slot: MechAction, ctx: ResolveContext): ActionDef | Rejection;
  look: UnitLook;
  commands: ReadonlyArray<CommandRow>;
  /** 画面右下の武装パネル。上から並べる */
  weapons: ReadonlyArray<WeaponPanelDef>;
};

/**
 * パネルに出す名前。武装の固有名ではなく、押し方から決まる共通の呼び名で統一する
 * （ビームライフル・サブ射撃・特殊射撃・特殊格闘・後格闘・格闘チャージなど）
 */
export function weaponPanelName(panel: WeaponPanelDef): string {
  const has = (b: WeaponButton) => panel.buttons.includes(b);
  if (panel.charge === 'melee' && !panel.ammo) return '格闘チャージ';
  if (has('shot') && has('melee')) return 'サブ射撃';
  if (has('shot') && has('jump')) return '特殊射撃';
  if (has('melee') && has('jump')) return '特殊格闘';
  const lever = { front: '前', side: '横', back: '後' } as const;
  if (has('melee')) return panel.lever ? `${lever[panel.lever]}格闘` : '格闘';
  return 'ビームライフル';
}

export function chargeTimeOf(unit: UnitDef, kind: 'shot' | 'melee'): number {
  return unit.chargeTime?.[kind] ?? DEFAULT_CHARGE_TIME;
}

export function isRejection(value: ActionDef | Rejection): value is Rejection {
  return 'reject' in value;
}
