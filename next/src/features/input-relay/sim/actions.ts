import type { ActionKind, ProjectileKind } from './types';

export const GRAVITY = 30;
export const BOOST_MAX = 100;
/** 着地硬直。これが明けるとブーストが全回復する */
export const LANDING_LAG_S = 0.25;
/** 格闘の踏み込みを止める敵との距離 */
export const MELEE_REACH = 3;
/** 格闘の攻撃判定が届く距離 */
export const MELEE_HIT_RANGE = 5;
/** 地上でレバーを倒したときの歩きの速さ */
export const WALK_SPEED = 9;
/** 空中・上昇中にレバーで横へ流れる速さ */
export const AIR_DRIFT_SPEED = 7;
/** 同じ方向にレバーを 2 回倒してステップになる間隔 */
export const STEP_TAP_WINDOW_S = 0.25;
/** BD 中にレバーの方向へ曲がる速さ（rad/s）。BD 旋回 */
export const BD_TURN_RATE = 3.2;
/**
 * 地上で出した BD は少し浮いて飛ぶ（地走機を除く EXVS の通常の BD）。この高さまで上がる。
 * 地面を滑ったまま BD が終わると「地上で止まった」扱いで硬直が入り、ズンダが途切れてしまう
 */
export const BD_LIFT_HEIGHT = 2.5;
export const BD_LIFT_SPEED = 8;
/**
 * BD からつないだ射撃を空中で撃っているあいだの落ち方（重力の倍率）。BD の勢いが残ってゆっくり落ちる。
 * 普通に落ちると、地上 BD の高さからでは次の BD を入れる前に着地して、ズンダが途切れやすい
 */
export const SHOT_AFTER_BD_GRAVITY_SCALE = 0.5;
/** 機体が向き直る速さ（rad/s） */
export const FACE_TURN_RATE = 9;
/**
 * 慣性ジャンプ: BD（レバー入れ）→ レバーを一度戻す → ジャンプと前後して同じ方向へ入れ直すと成立。
 * ジャンプとレバーの入れ直しの間がこの秒数以内なら成立とみなす（実機の猶予は未確認の仮の値）。
 * レバーなしのジャンプは慣性ジャンプにならない。
 */
export const INERTIA_LEVER_WINDOW_S = 0.7;
/**
 * ジャンプを始めてからこの時間内に BD が届いたら、そのジャンプは BD の 1 回目の押下だったとみなす。
 * アケコンの BD 判定の窓（2 回押し）と、射撃との同時押しを待つ遅れを足したくらい
 */
export const BD_FROM_JUMP_WINDOW_S = 0.3;
/** BD・ステップが終わってから、次の行動をまだ連携（ズンダなど）としてつなげる時間 */
export const CHAIN_GRACE_S = 0.2;
/**
 * ジャンプボタンをこの時間押し続けたらジャンプを始める。それより短い押下は BD（2 回押し）の 1 回目かもしれないので、
 * 押しただけでは飛ばない。短く 1 回だけ押したときは、アケコンが BD ではないと決めた時点（'jump'）で小ジャンプする
 */
export const JUMP_HOLD_S = 0.12;
/** レバーを戻さず入れっぱなしで出した慣性ジャンプは、飛距離が少し短い（速さの倍率） */
export const INERTIA_HELD_SCALE = 0.75;
/** 慣性ジャンプが成立したときの横の初速（BD は 30。普通のジャンプの横流れは 7） */
export const INERTIA_JUMP_SPEED = 21;
/** 慣性ジャンプで飛んでいる間の、空中での横の減速（普通の空中は 1.5） */
export const INERTIA_AIR_DAMPING = 0.45;
/** 慣性ジャンプ中、慣性の方向にレバーを入れたときの加速（m/s²） */
export const INERTIA_LEVER_ACCEL = 14;
/** 慣性ジャンプ中の水平速度の上限 */
export const INERTIA_MAX_SPEED = 34;
/** 振り向き撃ちで向き直るのにかかる時間。この分だけ発射と硬直が遅れる */
export const TURN_SHOT_DELAY_S = 0.22;
/**
 * 機体の向きと敵の方向がこの角度より開いていると振り向き撃ちになる（敵が後ろ側にいる）。
 * 90 度ちょうどだと、横 BD からの BR（ジグザグのズンダ）が少しのずれで振り向き撃ちになってしまう
 */
export const TURN_SHOT_ANGLE = (Math.PI * 2) / 3;
/** 滑り特射: ジャンプを押してからこの時間内に特射を出し、レバーを入れていれば滑る */
export const SLIDE_WINDOW_S = 0.15;
export const SLIDE_SPEED = 24;
/** 着地硬直が延び始めるブーストの吹かし回数と、1 回ごとの延び（秒） */
export const AIR_BOOST_FREE_USES = 3;
export const LANDING_LAG_PER_USE_S = 0.1;
export const LANDING_LAG_MAX_S = 0.75;

/**
 * 行動中の移動の仕方。
 * - free: 重力と慣性に任せる
 * - halt: 足を止める（地上では水平速度を殺し、空中では落下をゆるめる）。振り向き撃ちもこれ
 * - dash: 敵方向へ一定速度。落下しない
 * - lunge: 敵へ踏み込む。届いたら止まる。落下しない
 * - rise: 上昇し続ける（ジャンプ）。レバーで横に流れる
 * - step: 決まった向きへ素早く滑る。落下しない
 * - roll: 横へ転がりながら撃つ（横サブなど）。出だしが速く、だんだん止まる
 */
export type MoveMode = 'free' | 'halt' | 'dash' | 'lunge' | 'rise' | 'step' | 'roll';

/** 描画の姿勢。射撃系は銃を構え、格闘系は剣を振り、呼び出し系は手を掲げる */
export type MovePose = 'shoot' | 'slash' | 'throw' | 'summon' | 'none';

/** 呼び出す僚機（アシスト）・射出物 */
export type AssistKind = 'murasame' | 'freedom-shot' | 'freedom-melee' | 'ootori';

export type ProjectileSpec = {
  kind: ProjectileKind;
  speed: number;
  radius: number;
  life: number;
  homing: number;
  /** 発射数と左右の広がり（rad） */
  count: number;
  spread: number;
};

export type ActionDef = {
  /** 技の識別子。汎用機はスロット名と同じ。キャンセルルートでも使う */
  id?: string;
  duration: number;
  move: MoveMode;
  /** dash / lunge の速度 */
  speed?: number;
  /** lunge で踏み込む上限時間 */
  lungeTime?: number;
  /** 開始時に消費するブースト */
  boostCost: number;
  /** 行動中に毎秒消費するブースト */
  boostPerSec: number;
  /** 開始時の上向き初速 */
  riseSpeed?: number;
  /**
   * ジャンプボタンを押している間だけ続く行動。minTime を過ぎてボタンが離れていたら終わる
   * （duration は押しっぱなしでも切れる上限）
   */
  holdMinTime?: number;
  /** 弾を出す・攻撃判定を出すタイミング（秒） */
  fireAt?: number;
  projectile?: ProjectileSpec;
  /** 同時に撃つ弾が複数種類あるとき（ビーム＋レールガンなど）。projectile の代わりに使う */
  projectiles?: ReadonlyArray<ProjectileSpec>;
  /** 照射やミサイル連射のように、fireAt から一定間隔で何回も撃つ */
  volley?: { count: number; interval: number };
  /** 近接攻撃 */
  strike?: boolean;
  /** 格闘の最大段数（追加入力で何段まで出せるか）。省略時は 3 */
  comboMax?: number;
  /** 横格闘のように回り込む強さ（m/s）。レバーの左右で向きが決まる */
  curve?: number;
  /** 使う弾。弾がなければ出せない */
  ammo?: string;
  /** 1 回で使う弾数。省略時は 1 */
  ammoCost?: number;
  /** この技をメイン射撃でキャンセルすると自由落下に移れる（アメキャン対応） */
  fallCancel?: boolean;
  /** この技からのキャンセルルート。省略時はスロットの標準ルート */
  cancels?: { into: ReadonlyArray<string>; opens: 'always' | 'afterFire'; early?: ReadonlyArray<string> };
  /** fireAt で呼び出すアシスト・射出物 */
  assist?: AssistKind;
  /** fireAt で発動する時限強化 */
  buff?: 'seed';
  /** メイン射撃に合わせて、追従アシストも撃つ */
  linkAssists?: boolean;
  pose?: MovePose;
  label: string;
};

export const ACTIONS: Readonly<Record<Exclude<ActionKind, 'idle'>, ActionDef>> = {
  // BR は移動撃ち（慣性と落下はそのまま）。敵が後ろにいるときだけ振り向き撃ちで足が止まる
  shot: {
    id: 'shot',
    label: 'BR',
    duration: 0.45,
    move: 'free',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.15,
    projectile: { kind: 'beam', speed: 120, radius: 0.18, life: 1.2, homing: 0.6, count: 1, spread: 0 },
  },
  melee: {
    id: 'melee',
    label: '格闘',
    duration: 0.95,
    move: 'lunge',
    speed: 28,
    lungeTime: 0.6,
    boostCost: 5,
    boostPerSec: 0,
    fireAt: 0.6,
    strike: true,
  },
  jump: {
    id: 'jump',
    label: 'ジャンプ',
    duration: 10,
    holdMinTime: 0.12,
    move: 'rise',
    speed: 14,
    boostCost: 4,
    boostPerSec: 30,
  },
  bd: {
    id: 'bd',
    label: 'BD',
    duration: 10,
    holdMinTime: 0.35,
    move: 'dash',
    speed: 30,
    boostCost: 12,
    boostPerSec: 25,
  },
  step: {
    id: 'step',
    label: 'ステップ',
    duration: 0.38,
    move: 'step',
    speed: 26,
    boostCost: 12,
    boostPerSec: 0,
  },
  sub: {
    id: 'sub',
    label: 'サブ',
    fallCancel: true,
    duration: 0.6,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    projectile: { kind: 'missile', speed: 45, radius: 0.3, life: 3, homing: 2.5, count: 3, spread: 0.5 },
  },
  'special-shot': {
    id: 'special-shot',
    label: '特射',
    duration: 0.8,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.3,
    projectile: { kind: 'big-beam', speed: 90, radius: 0.6, life: 1.5, homing: 0.3, count: 1, spread: 0 },
  },
  'special-melee': {
    id: 'special-melee',
    label: '特格',
    duration: 0.7,
    move: 'free',
    boostCost: 10,
    boostPerSec: 0,
    riseSpeed: 14,
    fireAt: 0.25,
    strike: true,
  },
  'shot-cs': {
    id: 'shot-cs',
    label: '射CS',
    duration: 0.9,
    move: 'halt',
    boostCost: 0,
    boostPerSec: 0,
    fireAt: 0.2,
    projectile: { kind: 'cs-beam', speed: 80, radius: 0.9, life: 1.8, homing: 0, count: 1, spread: 0 },
  },
  'melee-cs': {
    id: 'melee-cs',
    label: '格CS',
    duration: 0.9,
    move: 'lunge',
    speed: 40,
    lungeTime: 0.45,
    boostCost: 10,
    boostPerSec: 0,
    fireAt: 0.45,
    strike: true,
  },
};

const SLOT_POSES: Readonly<Record<Exclude<ActionKind, 'idle'>, MovePose>> = {
  shot: 'shoot',
  sub: 'shoot',
  'special-shot': 'shoot',
  'shot-cs': 'shoot',
  melee: 'slash',
  'special-melee': 'slash',
  'melee-cs': 'slash',
  jump: 'none',
  bd: 'none',
  step: 'none',
};

/** 技の姿勢。技に指定がなければスロットから決める */
export function poseOf(action: ActionKind, move: ActionDef | null): MovePose {
  if (action === 'idle') return 'none';
  return move?.pose ?? SLOT_POSES[action];
}
