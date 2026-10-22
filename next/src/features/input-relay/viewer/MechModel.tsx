'use client';

/**
 * 箱と円柱で組んだ仮のロボ（白・青・赤のトリコロール）。
 *
 * 姿勢は React の state を通さず、useFrame で sim の状態を読んで直接書き換える
 * （毎フレームの再描画を避けるため）。
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Group, type Mesh, type PointLight } from 'three';
import { ACTIONS } from '../sim/actions';
import type { MechState, SimWorld } from '../sim/types';

const WHITE = '#eef0f3';
const GREY = '#9aa1ab';
const BLUE = '#2546c9';
const RED = '#d8352c';
const YELLOW = '#f2c21a';
const DARK = '#2f3238';
const EYE = '#59ff8a';
const THRUST = '#7ef9ff';
const SABER = '#ff5fd2';

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

function isBoosting(mech: MechState): boolean {
  return mech.action === 'bd' || mech.action === 'jump' || mech.action === 'step' || mech.action === 'special-melee' || mech.action === 'melee-cs' || (mech.action === 'melee' && !mech.actionFired);
}

function Part({
  args,
  position,
  rotation,
  color,
  emissive,
}: {
  args: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  emissive?: boolean;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.15}
        emissive={emissive ? color : '#000000'}
        emissiveIntensity={emissive ? 1.2 : 0}
      />
    </mesh>
  );
}

/** 二重のコーンで芯の白い炎を作る。scale.y を伸縮して噴射量を表す */
function Flame({ flameRef }: { flameRef: RefObject<Group | null> }) {
  return (
    <group ref={flameRef} position={[0, -0.32, 0]}>
      <mesh position={[0, -0.35, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.16, 0.8, 12]} />
        <meshBasicMaterial color={THRUST} transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.25, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.08, 0.5, 10]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function MechModel({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const saber = useRef<Group>(null);
  const saberTrail = useRef<Mesh>(null);
  const shield = useRef<Group>(null);
  const muzzleGlow = useRef<Mesh>(null);
  const flameL = useRef<Group>(null);
  const flameR = useRef<Group>(null);
  const thrustLight = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    const mech = worldRef.current.mech;
    const p = progress(mech);
    const t = clock.elapsedTime;
    const ease = (current: number, target: number, k: number) => current + (target - current) * k;

    if (root.current) {
      root.current.position.set(mech.pos.x, mech.pos.y, mech.pos.z);
      root.current.rotation.y = mech.yaw;
    }

    if (body.current) {
      // 特格は回転斬り、BD・格闘の踏み込みは前傾、着地硬直は沈み込む
      body.current.rotation.y = mech.action === 'special-melee' ? p * Math.PI * 4 : 0;
      let lean = mech.action === 'bd' ? 0.45 : isSlashing(mech) && !mech.actionFired ? 0.35 : 0;
      let tilt = 0;
      // ステップは進む向きへ体を傾ける
      if (mech.action === 'step' && mech.stepDir) {
        const forward = mech.stepDir.x * Math.sin(mech.yaw) + mech.stepDir.z * Math.cos(mech.yaw);
        const right = mech.stepDir.x * -Math.cos(mech.yaw) + mech.stepDir.z * Math.sin(mech.yaw);
        lean = forward * 0.35;
        tilt = -right * 0.4;
      }
      body.current.rotation.x = ease(body.current.rotation.x, lean, 0.25);
      body.current.rotation.z = ease(body.current.rotation.z, tilt, 0.25);
      body.current.position.y = ease(body.current.position.y, mech.landingLag > 0 ? -0.25 : 0, 0.3);
    }

    // 空中では脚をたたみ、BD では後ろへ流す
    const legSwing = mech.action === 'bd' ? 0.5 : !mech.grounded ? -0.35 : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = ease(leftLeg.current.rotation.x, legSwing, 0.2);
    if (rightLeg.current) rightLeg.current.rotation.x = ease(rightLeg.current.rotation.x, legSwing * (mech.grounded ? 1 : 0.6), 0.2);

    // 射撃系は右腕（ライフル）を前に構え、撃った瞬間に反動で少し跳ねる
    if (rightArm.current) {
      let recoil = 0;
      if (mech.action !== 'idle' && isShooting(mech) && mech.actionFired) {
        const sinceFire = mech.actionTime - (ACTIONS[mech.action].fireAt ?? 0);
        recoil = Math.max(0, 0.25 - sinceFire * 2);
      }
      const aim = isShooting(mech) || mech.charging.shot ? -Math.PI / 2 - recoil : -0.12;
      rightArm.current.rotation.x = ease(rightArm.current.rotation.x, aim, 0.35);
    }

    // 格闘系は左腕（サーベル）を振りかぶってから振り下ろす
    if (leftArm.current) {
      const slashing = isSlashing(mech);
      const stageFlip = mech.meleeStage === 2 ? -1 : 1;
      const swing = slashing ? (mech.actionFired ? 0.6 : -Math.PI * 0.85) : -0.12;
      leftArm.current.rotation.x = ease(leftArm.current.rotation.x, swing, mech.actionFired ? 0.6 : 0.3);
      leftArm.current.rotation.z = ease(leftArm.current.rotation.z, slashing ? 0.5 * stageFlip : 0, 0.3);
    }
    const saberOn = isSlashing(mech) || mech.charging.melee;
    if (saber.current) {
      saber.current.visible = saberOn;
      saber.current.scale.setScalar(mech.charging.melee ? 1 + Math.sin(t * 22) * 0.1 : 1);
    }
    if (shield.current) shield.current.visible = !saberOn;
    if (saberTrail.current) {
      const fresh = isSlashing(mech) && mech.actionFired;
      saberTrail.current.visible = fresh;
      const material = saberTrail.current.material as { opacity: number };
      material.opacity = fresh ? Math.max(0, 0.7 - p * 0.9) : 0;
    }

    if (muzzleGlow.current) {
      muzzleGlow.current.visible = mech.charging.shot;
      muzzleGlow.current.scale.setScalar(0.5 + Math.sin(t * 18) * 0.12 + Math.min(0.4, t % 1));
    }

    const boosting = isBoosting(mech);
    const flame = boosting ? 1 + Math.sin(t * 45) * 0.18 : 0.001;
    flameL.current?.scale.set(1, flame, 1);
    flameR.current?.scale.set(1, flame, 1);
    if (thrustLight.current) thrustLight.current.intensity = boosting ? 6 : 0;
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {/* 脚。股関節を支点に回す */}
        {([-0.32, 0.32] as const).map((x, i) => (
          <group key={x} ref={i === 0 ? leftLeg : rightLeg} position={[x, 1.15, 0]}>
            <Part args={[0.34, 0.55, 0.38]} position={[0, -0.3, 0]} color={WHITE} />
            <Part args={[0.3, 0.16, 0.12]} position={[0, -0.62, 0.2]} color={RED} />
            <Part args={[0.42, 0.62, 0.48]} position={[0, -0.85, -0.02]} color={WHITE} />
            <Part args={[0.36, 0.14, 0.12]} position={[0, -0.95, 0.24]} color={BLUE} />
            <Part args={[0.4, 0.16, 0.7]} position={[0, -1.17, 0.08]} color={RED} />
          </group>
        ))}
        {/* 腰とフロントスカート */}
        <Part args={[0.95, 0.28, 0.5]} position={[0, 1.22, 0]} color={WHITE} />
        <Part args={[0.2, 0.22, 0.1]} position={[0, 1.2, 0.27]} color={RED} />
        {([-0.27, 0.27] as const).map((x) => (
          <Part key={x} args={[0.32, 0.36, 0.08]} position={[x, 1.02, 0.25]} rotation={[0.15, 0, 0]} color={WHITE} />
        ))}
        {/* 胴。青い胸と黄色いダクト、赤いコクピット */}
        <Part args={[0.62, 0.22, 0.46]} position={[0, 1.46, 0]} color={RED} />
        <Part args={[1.1, 0.62, 0.62]} position={[0, 1.86, 0]} color={BLUE} />
        {([-0.27, 0.27] as const).map((x) => (
          <Part key={x} args={[0.28, 0.2, 0.06]} position={[x, 1.92, 0.32]} color={YELLOW} />
        ))}
        <Part args={[0.22, 0.2, 0.06]} position={[0, 1.7, 0.32]} color={RED} />
        {/* 頭。V アンテナ・緑の目・赤いあご */}
        <group position={[0, 2.4, 0.02]}>
          <Part args={[0.2, 0.12, 0.2]} position={[0, -0.18, 0]} color={GREY} />
          <Part args={[0.38, 0.34, 0.38]} position={[0, 0.02, 0]} color={WHITE} />
          <Part args={[0.26, 0.06, 0.04]} position={[0, 0.02, 0.2]} color={EYE} emissive />
          <Part args={[0.1, 0.06, 0.06]} position={[0, -0.13, 0.19]} color={RED} />
          <Part args={[0.08, 0.08, 0.06]} position={[0, 0.16, 0.2]} color={RED} />
          <Part args={[0.38, 0.05, 0.03]} position={[-0.15, 0.27, 0.2]} rotation={[0, 0, -0.75]} color={YELLOW} />
          <Part args={[0.38, 0.05, 0.03]} position={[0.15, 0.27, 0.2]} rotation={[0, 0, 0.75]} color={YELLOW} />
        </group>
        {/* バックパックとスラスター、サーベルの柄 */}
        <Part args={[0.7, 0.6, 0.3]} position={[0, 1.95, -0.42]} color={GREY} />
        {([-0.22, 0.22] as const).map((x) => (
          <Part key={`hilt-${x}`} args={[0.07, 0.4, 0.07]} position={[x, 2.32, -0.5]} rotation={[-0.4, 0, 0]} color={WHITE} />
        ))}
        {([-0.22, 0.22] as const).map((x, i) => (
          <group key={x} position={[x, 1.68, -0.55]} rotation={[0.55, 0, 0]}>
            <mesh>
              <cylinderGeometry args={[0.1, 0.15, 0.3, 12]} />
              <meshStandardMaterial color={DARK} metalness={0.5} roughness={0.4} />
            </mesh>
            <Flame flameRef={i === 0 ? flameL : flameR} />
          </group>
        ))}
        <pointLight ref={thrustLight} position={[0, 1.4, -1.1]} color={THRUST} intensity={0} distance={6} />
        {/* 右腕＋ビームライフル。肩を支点に回す */}
        <group position={[0.72, 2.0, 0]}>
          <Part args={[0.46, 0.4, 0.5]} position={[0.08, 0.06, 0]} color={WHITE} />
          <Part args={[0.47, 0.1, 0.51]} position={[0.08, 0.28, 0]} color={BLUE} />
          <group ref={rightArm}>
            <Part args={[0.24, 0.5, 0.26]} position={[0.08, -0.38, 0]} color={WHITE} />
            <Part args={[0.3, 0.5, 0.32]} position={[0.08, -0.82, 0]} color={WHITE} />
            <Part args={[0.2, 0.16, 0.2]} position={[0.08, -1.12, 0]} color={GREY} />
            <group position={[0.08, -1.18, 0.35]}>
              <Part args={[0.14, 0.2, 1.15]} position={[0, 0, 0]} color={DARK} />
              <Part args={[0.08, 0.1, 0.4]} position={[0, 0.15, -0.1]} color={GREY} />
              <Part args={[0.1, 0.26, 0.14]} position={[0, -0.18, -0.15]} color={DARK} />
              <mesh ref={muzzleGlow} position={[0, 0, 0.7]} visible={false}>
                <sphereGeometry args={[0.32, 16, 16]} />
                <meshBasicMaterial color={THRUST} transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
              </mesh>
            </group>
          </group>
        </group>
        {/* 左腕＋シールド／サーベル */}
        <group position={[-0.72, 2.0, 0]}>
          <Part args={[0.46, 0.4, 0.5]} position={[-0.08, 0.06, 0]} color={WHITE} />
          <Part args={[0.47, 0.1, 0.51]} position={[-0.08, 0.28, 0]} color={BLUE} />
          <group ref={leftArm}>
            <Part args={[0.24, 0.5, 0.26]} position={[-0.08, -0.38, 0]} color={WHITE} />
            <Part args={[0.3, 0.5, 0.32]} position={[-0.08, -0.82, 0]} color={WHITE} />
            <Part args={[0.2, 0.16, 0.2]} position={[-0.08, -1.12, 0]} color={GREY} />
            <group ref={shield} position={[-0.3, -0.8, 0.1]}>
              <Part args={[0.08, 1.3, 0.75]} position={[0, 0, 0]} color={RED} />
              <Part args={[0.09, 0.9, 0.55]} position={[-0.01, 0.12, 0]} color={WHITE} />
              <Part args={[0.1, 0.12, 0.4]} position={[-0.02, 0.3, 0]} color={YELLOW} />
              <Part args={[0.1, 0.5, 0.1]} position={[-0.02, 0.2, 0]} color={YELLOW} />
            </group>
            <group ref={saber} position={[-0.08, -1.18, 0.15]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
              <mesh position={[0, 1.0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 2.0, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0, 1.0, 0]}>
                <cylinderGeometry args={[0.13, 0.11, 2.1, 10]} />
                <meshBasicMaterial color={SABER} transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
              </mesh>
            </group>
          </group>
        </group>
        {/* サーベルの軌跡。振った直後だけ前方に弧を出す */}
        <mesh ref={saberTrail} position={[0, 1.9, 0.6]} rotation={[0, Math.PI / 2, 0]} visible={false}>
          <torusGeometry args={[1.9, 0.18, 6, 24, Math.PI * 0.9]} />
          <meshBasicMaterial color={SABER} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
