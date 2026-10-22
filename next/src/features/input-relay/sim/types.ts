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
  | 'sub'
  | 'special-shot'
  | 'special-melee'
  | 'shot-cs'
  | 'melee-cs';

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
};
