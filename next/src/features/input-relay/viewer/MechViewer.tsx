'use client';

/**
 * PC 側の 3D ビュー。three を使うので `next/dynamic`（ssr:false）で読み込む前提。
 *
 * sim の world は親が ref で持ち、入力はそこへ直接適用される。ここでは毎フレーム
 * 固定刻みで sim を進め、各部品がその状態を読んで描画する。
 */
import { useRef, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { advanceWorld } from '../sim/step';
import type { SimWorld } from '../sim/types';
import { EnemyDummy } from './EnemyDummy';
import { MechModel } from './MechModel';
import { Projectiles } from './Projectiles';

const SKY = '#9fb6cf';

/** 最初にマウントして、他の部品より先に sim を進める */
function SimDriver({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const carry = useRef(0);
  useFrame((_, delta) => {
    carry.current = advanceWorld(worldRef.current, delta, carry.current);
  });
  return null;
}

const cameraTarget = new Vector3();
const lookTarget = new Vector3();

/** 機体の後ろ上から、機体と敵を結ぶ方向を見る（EXVS の三人称視点） */
function CameraRig({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  useFrame(({ camera }) => {
    const { mech, enemy } = worldRef.current;
    // 真後ろだと機体が敵を隠すので、少し右にずらす
    const back = 13;
    const side = 2.2;
    const sinYaw = Math.sin(mech.yaw);
    const cosYaw = Math.cos(mech.yaw);
    cameraTarget.set(
      mech.pos.x - sinYaw * back - cosYaw * side,
      mech.pos.y + 5.5,
      mech.pos.z - cosYaw * back + sinYaw * side,
    );
    camera.position.lerp(cameraTarget, 0.12);
    lookTarget.set(
      mech.pos.x + (enemy.pos.x - mech.pos.x) * 0.5,
      mech.pos.y + 1.5 + (enemy.pos.y - mech.pos.y) * 0.5,
      mech.pos.z + (enemy.pos.z - mech.pos.z) * 0.5,
    );
    camera.lookAt(lookTarget);
  });
  return null;
}

export function MechViewer({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  return (
    <Canvas shadows camera={{ fov: 55, near: 0.1, far: 500, position: [0, 4.5, 10] }}>
      <SimDriver worldRef={worldRef} />
      <CameraRig worldRef={worldRef} />
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 60, 220]} />
      <hemisphereLight args={['#ffffff', '#55606b', 0.8]} />
      <directionalLight position={[20, 40, 15]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#6f7d6a" />
      </mesh>
      <gridHelper args={[600, 120, '#4c5a49', '#5d6a59']} position={[0, 0.01, 0]} />
      <MechModel worldRef={worldRef} />
      <EnemyDummy worldRef={worldRef} />
      <Projectiles worldRef={worldRef} />
    </Canvas>
  );
}
