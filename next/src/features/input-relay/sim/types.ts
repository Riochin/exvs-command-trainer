/**
 * PC 側 3D ビューアのシミュレーション状態。
 *
 * 描画（three）に依存しない純粋なデータにしておき、vitest で挙動を確かめられるようにする。
 * 座標はメートル、時間は秒。y が上。
 */
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
  | 'melee-cs';

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

export type EffectKind = 'hit' | 'muzzle' | 'land' | 'slash';

/** 一瞬だけ出す見た目の効果。sim が発生させ、描画は寿命に合わせて広げて消す */
export type Effect = {
  id: number;
  kind: EffectKind;
  pos: Vec3;
  age: number;
  life: number;
};

export type ProjectileKind = 'beam' | 'missile' | 'big-beam' | 'cs-beam';

export type Projectile = {
  id: number;
  kind: ProjectileKind;
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
  /** 向き（rad）。常に敵の方向 */
  yaw: number;
  /** 0〜BOOST_MAX */
  boost: number;
  /** ブーストを使い切って空中にいる。着地するまでブーストを使う行動ができない */
  overheat: boolean;
  grounded: boolean;
  /** 着地硬直の残り（秒）。0 より大きいあいだは行動できない */
  landingLag: number;
  action: ActionKind;
  /** 今の行動の経過時間（秒） */
  actionTime: number;
  /** 今の行動で弾や攻撃判定をもう出したか */
  actionFired: boolean;
  charging: { shot: boolean; melee: boolean };
  /** 格闘の何段目か（1〜3）。格闘以外では 0 */
  meleeStage: number;
  /** キャンセル受付前に来た入力。受付が始まったときにまだ新しければ出す */
  buffered: { action: MechAction; at: number } | null;
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
};

export type EnemyState = {
  pos: Vec3;
  /** 被弾時に光らせる残り時間（秒） */
  hitFlash: number;
  hitCount: number;
};

export type SimWorld = {
  time: number;
  mech: MechState;
  enemy: EnemyState;
  projectiles: Projectile[];
  nextProjectileId: number;
  events: SimEvent[];
  nextEventId: number;
  effects: Effect[];
  nextEffectId: number;
};
