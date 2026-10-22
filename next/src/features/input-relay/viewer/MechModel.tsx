'use client';

/**
 * 箱と円柱で組んだ仮のロボ。
 *
 * 姿勢は React の state を通さず、useFrame で sim の状態を読んで直接書き換える
 * （毎フレームの再描画を避けるため）。
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { ACTIONS } from '../sim/actions';
import type { MechState, SimWorld } from '../sim/types';

const WHITE = '#e9ecef';
const BLUE = '#2f4fd6';
const RED = '#d8352c';
const YELLOW = '#f2c21a';
const DARK = '#3a3d44';
const BEAM = '#7ef9ff';
const SABER = '#ff6ad5';

/** 0→1 の進み具合（行動していなければ 0） */
function progress(mech: MechState): number {
  if (mech.action === 'idle') return 0;
  return Math.min(1, mech.actionTime / ACTIONS[mech.action].duration);
}

function isShooting(mech: MechState): boolean {
  return mech.action === 'shot' || mech.action === 'sub' || mech.action === 'special-shot' || mech.action === 'shot-cs';
}

function isSlashing(mech: MechState): boolean {
  return mech.action === 'melee' || mech.action === 'special-melee' || mech.action === 'melee-cs';
}

export function MechModel({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const saber = useRef<Mesh>(null);
  const muzzleGlow = useRef<Mesh>(null);
  const flameL = useRef<Mesh>(null);
  const flameR = useRef<Mesh>(null);
  const legs = useRef<Group>(null);

  useFrame(({ clock }) => {
    const mech = worldRef.current.mech;
    const p = progress(mech);
    if (root.current) {
      root.current.position.set(mech.pos.x, mech.pos.y, mech.pos.z);
      root.current.rotation.y = mech.yaw;
    }

    // 特格は回転斬り、BD は前傾
    if (body.current) {
      body.current.rotation.y = mech.action === 'special-melee' ? p * Math.PI * 4 : 0;
      body.current.rotation.x = mech.action === 'bd' ? 0.35 : mech.action === 'melee' || mech.action === 'melee-cs' ? 0.2 : 0;
    }

    // 射撃系は右腕（ライフル）を前に構える
    if (rightArm.current) {
      const aim = isShooting(mech) || mech.charging.shot ? -Math.PI / 2 : -0.15;
      rightArm.current.rotation.x += (aim - rightArm.current.rotation.x) * 0.35;
    }

    // 格闘系は左腕（サーベル）を振り下ろす
    if (leftArm.current) {
      const swing = isSlashing(mech) ? -Math.PI * 0.9 + p * Math.PI * 1.1 : -0.15;
      leftArm.current.rotation.x += (swing - leftArm.current.rotation.x) * 0.45;
    }
    if (saber.current) {
      saber.current.visible = isSlashing(mech) || mech.charging.melee;
      saber.current.scale.setScalar(mech.charging.melee ? 1 + Math.sin(clock.elapsedTime * 20) * 0.08 : 1);
    }

    if (muzzleGlow.current) {
      muzzleGlow.current.visible = mech.charging.shot;
      muzzleGlow.current.scale.setScalar(0.6 + Math.sin(clock.elapsedTime * 18) * 0.15);
    }

    // ブースター。BD・上昇中に火を噴く
    const boosting = mech.action === 'bd' || mech.action === 'jump' || mech.action === 'special-melee' || mech.action === 'melee' || mech.action === 'melee-cs';
    const flame = boosting ? 1 + Math.sin(clock.elapsedTime * 40) * 0.2 : 0.001;
    flameL.current?.scale.set(1, flame, 1);
    flameR.current?.scale.set(1, flame, 1);

    // 着地硬直でしゃがむ
    if (legs.current) legs.current.scale.y = mech.landingLag > 0 ? 0.8 : 1;
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <group ref={legs}>
          <mesh position={[-0.35, 0.55, 0]} castShadow>
            <boxGeometry args={[0.38, 1.1, 0.45]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
          <mesh position={[0.35, 0.55, 0]} castShadow>
            <boxGeometry args={[0.38, 1.1, 0.45]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
        </group>
        {/* 腰・胴・頭 */}
        <mesh position={[0, 1.2, 0]} castShadow>
          <boxGeometry args={[0.95, 0.3, 0.5]} />
          <meshStandardMaterial color={RED} />
        </mesh>
        <mesh position={[0, 1.75, 0]} castShadow>
          <boxGeometry args={[1.15, 0.8, 0.65]} />
          <meshStandardMaterial color={BLUE} />
        </mesh>
        <mesh position={[0, 2.35, 0.02]} castShadow>
          <boxGeometry args={[0.42, 0.4, 0.42]} />
          <meshStandardMaterial color={WHITE} />
        </mesh>
        <mesh position={[0, 2.55, 0.2]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.6, 0.06, 0.04]} />
          <meshStandardMaterial color={YELLOW} emissive={YELLOW} emissiveIntensity={0.4} />
        </mesh>
        {/* 背中のブースター */}
        {([-0.3, 0.3] as const).map((x, i) => (
          <group key={x} position={[x, 1.8, -0.42]}>
            <mesh rotation={[0.3, 0, 0]}>
              <cylinderGeometry args={[0.12, 0.16, 0.5, 10]} />
              <meshStandardMaterial color={DARK} />
            </mesh>
            <mesh ref={i === 0 ? flameL : flameR} position={[0, -0.45, -0.1]} rotation={[0.3, 0, 0]}>
              <coneGeometry args={[0.13, 0.7, 10]} />
              <meshBasicMaterial color={BEAM} transparent opacity={0.8} />
            </mesh>
          </group>
        ))}
        {/* 右腕＋ライフル。肩を支点に回す */}
        <group ref={rightArm} position={[0.75, 2.0, 0]}>
          <mesh position={[0, -0.45, 0]} castShadow>
            <boxGeometry args={[0.3, 0.9, 0.3]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
          <mesh position={[0.05, -0.9, 0.35]} castShadow>
            <boxGeometry args={[0.16, 0.2, 1.1]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          <mesh ref={muzzleGlow} position={[0.05, -0.9, 0.95]} visible={false}>
            <sphereGeometry args={[0.35, 16, 16]} />
            <meshBasicMaterial color={BEAM} transparent opacity={0.85} />
          </mesh>
        </group>
        {/* 左腕＋サーベル */}
        <group ref={leftArm} position={[-0.75, 2.0, 0]}>
          <mesh position={[0, -0.45, 0]} castShadow>
            <boxGeometry args={[0.3, 0.9, 0.3]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
          <mesh ref={saber} position={[0, -0.95, 0.9]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <cylinderGeometry args={[0.07, 0.07, 1.8, 8]} />
            <meshBasicMaterial color={SABER} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
