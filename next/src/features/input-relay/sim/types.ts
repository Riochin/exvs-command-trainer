/**
 * PC 側 3D ビューアのシミュレーション状態。
 *
 * 描画（three）に依存しない純粋なデータにしておき、vitest で挙動を確かめられるようにする。
 * 座標はメートル、時間は秒。y が上。
 */
import type { ActionDef, AssistKind } from './actions';

export type Vec3 = { x: number; y: number; z: number };

export type ActionKind =
  | 'idle'
  | 'shot'
  | 'melee'
  | 'jump'
  | 'bd'
  | 'step'
  | 'sub'
  | 'special-shot'
  | 'special-melee'
  | 'shot-cs'
  | 'melee-cs'
  | 'guard';

export type MechAction = Exclude<ActionKind, 'idle'>;

/** レバーの方向。前は敵の方向（ロックオン基準） */
export type LeverDirection = 'forward' | 'back' | 'left' | 'right';

/** レバーの倒し具合。x は右が正、y は前（敵の方向）が正。-1〜1 */
export type Lever = { x: number; y: number };

/**
 * 入力の扱われ方。
 * - started: 何もしていない状態から出した
 * - canceled: 行動中にキャンセルして出した
 * - buffered: キャンセルできる時点より少し早かったので、受付まで待たせた
 * - rejected: 出せなかった
 */
export type InputResult = 'started' | 'canceled' | 'buffered' | 'rejected';

/** HUD に出すための出来事。ルート名（ズンダなど）や出せなかった理由 */
export type SimEvent = {
  id: number;
  kind: 'route' | 'reject';
  label: string;
  time: number;
};

export type EffectKind = 'hit' | 'muzzle' | 'land' | 'slash' | 'guard';

/** 一瞬だけ出す見た目の効果。sim が発生させ、描画は寿命に合わせて広げて消す */
export type Effect = {
  id: number;
  kind: EffectKind;
  pos: Vec3;
  age: number;
  life: number;
};

export type ProjectileKind =
  | 'beam'
  | 'missile'
  | 'big-beam'
  | 'cs-beam'
  | 'enemy-beam'
  | 'rail'
  | 'laser'
  | 'small-missile'
  | 'sword'
  | 'assist-beam'
  | 'bit'
  | 'heat-hawk';

/** 呼び出したアシストや射出物。機体の周りに付いてくるものと、敵へ向かうものがある */
export type Assist = {
  id: number;
  kind: AssistKind;
  pos: Vec3;
  /** 向き（rad） */
  yaw: number;
  age: number;
  life: number;
  /** 追従アシストの左右（-1 / 1） */
  side: number;
  /** 何回撃ったか・何回殴ったか */
  shots: number;
};

export type Projectile = {
  id: number;
  kind: ProjectileKind;
  /** 誰が撃ったか。敵の弾は機体に当たり、機体の弾は敵に当たる */
  owner: 'mech' | 'enemy';
  pos: Vec3;
  vel: Vec3;
  /** 残り寿命（秒） */
  life: number;
  radius: number;
  /** 敵へ向きを寄せる強さ（rad/s）。0 なら直進 */
  homing: number;
};

export type MechState = {
  pos: Vec3;
  vel: Vec3;
  /** 機体の向き（rad）。BD 中は進む向き、止まっていれば敵の方へ向き直る */
  yaw: number;
  /** 敵の方向（rad）。カメラと振り向き撃ちの判定に使う */
  lockYaw: number;
  /** 0〜BOOST_MAX */
  boost: number;
  /** ブーストを使い切って空中にいる。着地するまでブーストを使う行動ができない */
  overheat: boolean;
  grounded: boolean;
  /** 着地硬直の残り（秒）。0 より大きいあいだは行動できない */
  landingLag: number;
  action: ActionKind;
  /** 今出している技（機体ごとの技データ）。何もしていなければ null */
  move: ActionDef | null;
  /** つないだ技の表示名。HUD に出す */
  chainLabels: string[];
  /** 今の行動の経過時間（秒） */
  actionTime: number;
  /** 今の行動で弾や攻撃判定をもう出したか */
  actionFired: boolean;
  charging: { shot: boolean; melee: boolean };
  /** チャージを始めた時刻（sim の秒）。溜めていなければ null。満タンまでの時間は機体の chargeTime */
  chargeSince: { shot: number | null; melee: number | null };
  /** 格闘の何段目か（1〜3）。格闘以外では 0 */
  meleeStage: number;
  /** キャンセル受付前に来た入力。受付が始まったときにまだ新しければ出す */
  buffered: { action: MechAction; move: ActionDef; at: number } | null;
  /** 止まらずにつないだ行動の並び。ルート名の判定に使う */
  chain: MechAction[];
  /** ジャンプボタンを押しているか。ジャンプの上昇と BD は押している間だけ続く */
  jumpHeld: boolean;
  /** いま倒しているレバーの方向（同時に複数倒せる） */
  leverHeld: LeverDirection[];
  /** ステップ判定用。直前にレバーを倒した方向と時刻 */
  lastLeverTap: { direction: LeverDirection; at: number } | null;
  /** ステップの進む向き（ワールド座標の水平単位ベクトル）。ステップ中だけ使う */
  stepDir: { x: number; z: number } | null;
  /** BD の進む向き。レバーの方向へ少しずつ曲がる（BD 旋回） */
  bdDir: { x: number; z: number } | null;
  /** BD・ステップの慣性を次のジャンプに乗せられるか。慣性ジャンプを 1 回出すと消える */
  inertiaAvailable: boolean;
  /** いまのジャンプに慣性が乗っているか */
  carryInertia: boolean;
  /** いまの射撃が振り向き撃ち（足が止まる）か */
  turnShot: boolean;
  /** 滑り特射で滑っている */
  sliding: boolean;
  /** 着地してからブーストを吹かした回数。多いほど着地硬直が長くなる */
  airBoostUses: number;
  /** 被弾時に光らせる残り時間（秒） */
  hitFlash: number;
  /** 弾数。キーは機体データの弾の名前 */
  ammo: Record<string, { count: number; timer: number }>;
  /** 時限強化（SEED 発現など）の残り時間（秒） */
  seedTime: number;
  /** 時限強化を使い終わってから、また使えるまでの残り（秒） */
  seedCooldown: number;
  /** 背中の装備（オオトリなど）を射出している */
  packOut: boolean;
  /** 今の技で何発撃ったか（照射・連射用） */
  shotsFired: number;
  /** 横格闘の回り込みの向き（-1 / 0 / 1） */
  curveSign: number;
  /** BD 中に倒していたレバーの方向。慣性ジャンプはこの方向に入れ直すと成立する */
  bdLever: LeverDirection | null;
  /** BD 中かそのあとに、レバーを一度ニュートラルに戻したか */
  leverNeutralSinceBd: boolean;
  /** 最後にレバーを倒した方向と時刻 */
  lastLeverPress: { direction: LeverDirection; at: number } | null;
  /** ジャンプを押したあと、レバーの入れ直しを待っている慣性ジャンプ */
  inertiaPending: { direction: LeverDirection; until: number } | null;
  /** 慣性ジャンプで飛んでいる。着地するまで横の勢いが落ちにくい */
  inertiaFlight: boolean;
  /** BD・ステップが終わったあと、次の行動を連携としてつなげる期限（world.time）。なければ null */
  chainGraceUntil: number | null;
  /** 今のジャンプボタンの押下。押した時刻と、その押下でもうジャンプを始めたか。BD になったら null */
  jumpPress: { at: number; started: boolean } | null;
  /**
   * 硬直中（着地硬直・キャンセルできない技）に入れた盾の先行入力。入れた時刻。
   * 硬直が切れたら盾を出す。ほかの行動を出したら消える
   */
  guardQueuedAt: number | null;
  /** 盾が成立して構え続ける期限（world.time）。成立していなければ null */
  guardBlockUntil: number | null;
};

export type EnemyState = {
  pos: Vec3;
  /** 左右に動くか。止めるとカメラも回り込まない */
  moves: boolean;
  /** 左右の揺れの経過時間（秒）。止めている間は進まない */
  swayTime: number;
  /** 射撃の間隔（秒）。0 なら撃たない */
  fireInterval: number;
  /** 次に撃つまでの残り（秒） */
  fireTimer: number;
  /** 被弾時に光らせる残り時間（秒） */
  hitFlash: number;
  hitCount: number;
};

export type SimWorld = {
  time: number;
  /** 選んでいる機体 */
  unitId: string;
  assists: Assist[];
  nextAssistId: number;
  mech: MechState;
  enemy: EnemyState;
  projectiles: Projectile[];
  nextProjectileId: number;
  events: SimEvent[];
  nextEventId: number;
  effects: Effect[];
  nextEffectId: number;
  /** 機体が敵の弾に当たった回数 */
  mechHits: number;
};
