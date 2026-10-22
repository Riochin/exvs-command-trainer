'use client';

import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { SimWorld } from '../sim/types';

const BODY = '#4a5a3a';
const HIT = '#ff3b3b';

/** 標的の敵機。被弾すると赤く光り、頭上のロックオン表示が回る */
export function EnemyDummy({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const root = useRef<Group>(null);
  const body = useRef<Mesh>(null);
  const marker = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const { enemy, mech } = worldRef.current;
    if (root.current) {
      root.current.position.set(enemy.pos.x, enemy.pos.y, enemy.pos.z);
      root.current.rotation.y = Math.atan2(mech.pos.x - enemy.pos.x, mech.pos.z - enemy.pos.z);
    }
    const material = body.current?.material as MeshStandardMaterial | undefined;
    if (material) {
      material.emissive.set(enemy.hitFlash > 0 ? HIT : '#000000');
      material.emissiveIntensity = enemy.hitFlash > 0 ? 1.5 : 0;
    }
    if (marker.current) marker.current.rotation.z = clock.elapsedTime * 2;
  });

  return (
    <group ref={root}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.9, 1.2, 0.5]} />
        <meshStandardMaterial color={BODY} />
      </mesh>
      <mesh ref={body} position={[0, 1.75, 0]} castShadow>
        <boxGeometry args={[1.3, 1.0, 0.8]} />
        <meshStandardMaterial color={BODY} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <sphereGeometry args={[0.35, 12, 12]} />
        <meshStandardMaterial color={BODY} />
      </mesh>
      <mesh position={[0, 2.5, 0.3]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color={HIT} />
      </mesh>
      <mesh ref={marker} position={[0, 3.6, 0]}>
        <torusGeometry args={[0.5, 0.05, 6, 4]} />
        <meshBasicMaterial color={HIT} />
      </mesh>
    </group>
  );
}
