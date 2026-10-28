'use client';

/**
 * 機体ごとに差し替える装備のモデル（背中の装備・格闘武器）。
 * 新しい装備を足すときは、sim/units/types.ts の BackpackKind / MeleeWeaponKind に名前を足し、
 * ここにモデルを足す。機体データの look で名前を選ぶ。
 *
 * 座標は MechModel の胴（body）グループ基準。y が上、z が前（敵の方向）、背中は z がマイナス。
 */
import { AdditiveBlending, type Group } from 'three';
import type { RefObject } from 'react';
import type { BackpackKind, MeleeWeaponKind, UnitLook } from '../../sim/units';
import { BLADE, DARK, GREY, Part, SABER } from './Part';

export type BackpackProps = {
  look: UnitLook;
  /**
   * 射出できる部分（オオトリなど）に付ける ref。MechModel が packOut の間これを隠す。
   * 射出しない装備では使わない
   */
  detachRef: RefObject<Group | null>;
};

/** 標準のバックパックに付けるサーベルの柄 */
function StandardBackpack({ look }: BackpackProps) {
  return (
    <>
      {([-0.22, 0.22] as const).map((x) => (
        <Part key={`hilt-${x}`} args={[0.07, 0.4, 0.07]} position={[x, 2.32, -0.5]} rotation={[-0.4, 0, 0]} color={look.frame} />
      ))}
    </>
  );
}

/** オオトリ: 左右の大きな翼と、肩越しのビームランチャー・レールガン、対艦刀 */
function OotoriBackpack({ look, detachRef }: BackpackProps) {
  return (
    <group ref={detachRef} position={[0, 2.0, -0.75]}>
      <Part args={[0.6, 0.5, 0.6]} position={[0, 0, 0]} color={look.accent} />
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <Part args={[1.7, 0.1, 0.7]} position={[side * 1.05, 0.25, -0.15]} rotation={[0, 0, side * -0.35]} color={look.frame} />
          <Part args={[0.5, 0.11, 0.5]} position={[side * 1.7, 0.53, -0.15]} rotation={[0, 0, side * -0.35]} color={look.accent} />
          <Part args={[0.16, 0.16, 2.2]} position={[side * 0.45, 0.55, 0.55]} color={DARK} />
          <Part args={[0.22, 0.22, 0.5]} position={[side * 0.45, 0.55, -0.2]} color={GREY} />
        </group>
      ))}
      <Part args={[0.12, 1.6, 0.18]} position={[0.32, -0.35, -0.3]} rotation={[0, 0, 0.3]} color={BLADE} />
    </group>
  );
}

export const BACKPACKS: Readonly<Record<BackpackKind, (props: BackpackProps) => React.JSX.Element>> = {
  standard: StandardBackpack,
  ootori: OotoriBackpack,
};

/**
 * 格闘武器。左手の先に付き、格闘中と格闘チャージ中だけ見える。
 * 原点が柄で、+y が刃先（腕を振ると前へ向く）
 */
function BeamSaber() {
  return (
    <>
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 2.0, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.13, 0.11, 2.1, 10]} />
        <meshBasicMaterial color={SABER} transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  );
}

/** 対艦刀: 長い実体剣と、刃先のビーム */
function AntiShipBlade() {
  return (
    <>
      <Part args={[0.12, 2.6, 0.32]} position={[0, 1.3, 0]} color={BLADE} />
      <Part args={[0.14, 0.4, 0.14]} position={[0, -0.05, 0]} color={DARK} />
      <mesh position={[0, 1.3, 0.2]}>
        <boxGeometry args={[0.06, 2.5, 0.08]} />
        <meshBasicMaterial color={SABER} transparent opacity={0.7} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  );
}

export const MELEE_WEAPONS: Readonly<Record<MeleeWeaponKind, () => React.JSX.Element>> = {
  saber: BeamSaber,
  blade: AntiShipBlade,
};
