'use client';

import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Group, type MeshStandardMaterial } from 'three';
import type { SimWorld } from '../sim/types';

const BODY = '#4f6b3c';
const BODY_DARK = '#34472a';
const PIPE = '#2a2d31';
const MONO_EYE = '#ff4fb0';
const HIT = '#ff3b3b';
const LOCK = '#ff3b3b';

type BoxProps = {
  args: [number, number, number];
  position: [number, number, number];
  color?: string;
  onMaterial: (material: MeshStandardMaterial | null) => void;
};

function EnemyBox({ args, position, color = BODY, onMaterial }: BoxProps) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial ref={onMaterial} color={color} roughness={0.7} />
    </mesh>
  );
}

/** 標的の敵機（緑の量産機ふう）。被弾すると赤く光ってのけぞり、頭上のロックオン表示が回る */
export function EnemyDummy({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const marker = useRef<Group>(null);
  const materials = useRef<MeshStandardMaterial[]>([]);

  useFrame(({ clock }) => {
    const { enemy, mech } = worldRef.current;
    if (root.current) {
      root.current.position.set(enemy.pos.x, enemy.pos.y, enemy.pos.z);
      root.current.rotation.y = Math.atan2(mech.pos.x - enemy.pos.x, mech.pos.z - enemy.pos.z);
    }
    const flash = enemy.hitFlash > 0;
    for (const material of materials.current) {
      material.emissive.set(flash ? HIT : '#000000');
      material.emissiveIntensity = flash ? 1.2 : 0;
    }
    if (body.current) body.current.rotation.x = flash ? -0.25 : body.current.rotation.x * 0.85;
    if (marker.current) {
      marker.current.rotation.z = clock.elapsedTime * 1.5;
      marker.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 6) * 0.06);
    }
  });

  const collect = (material: MeshStandardMaterial | null) => {
    if (material && !materials.current.includes(material)) materials.current.push(material);
  };

  return (
    <group ref={root}>
      <group ref={body}>
        {/* 脚（太め） */}
        {([-0.38, 0.38] as const).map((x) => (
          <group key={x}>
            <EnemyBox onMaterial={collect} args={[0.42, 0.6, 0.5]} position={[x, 0.85, 0]} />
            <EnemyBox onMaterial={collect} args={[0.56, 0.7, 0.62]} position={[x, 0.35, 0]} color={BODY_DARK} />
          </group>
        ))}
        <EnemyBox onMaterial={collect} args={[1.0, 0.35, 0.6]} position={[0, 1.25, 0]} color={BODY_DARK} />
        <EnemyBox onMaterial={collect} args={[1.25, 0.85, 0.8]} position={[0, 1.8, 0]} />
        {/* 丸い肩とスパイク */}
        <mesh position={[0.85, 2.05, 0]} castShadow>
          <sphereGeometry args={[0.38, 14, 12]} />
          <meshStandardMaterial ref={collect} color={BODY} roughness={0.7} />
        </mesh>
        <EnemyBox onMaterial={collect} args={[0.5, 0.5, 0.6]} position={[-0.85, 2.0, 0]} color={BODY_DARK} />
        {([-0.35, 0.35] as const).map((x) => (
          <EnemyBox onMaterial={collect} key={x} args={[0.25, 0.9, 0.25]} position={[x * 2.4, 1.45, 0]} />
        ))}
        {/* 頭とモノアイ、動力パイプ */}
        <mesh position={[0, 2.5, 0]} castShadow>
          <sphereGeometry args={[0.38, 16, 14]} />
          <meshStandardMaterial ref={collect} color={BODY} roughness={0.6} />
        </mesh>
        <mesh position={[0, 2.5, 0.34]}>
          <sphereGeometry args={[0.09, 10, 10]} />
          <meshBasicMaterial color={MONO_EYE} />
        </mesh>
        <mesh position={[0, 2.5, 0.34]}>
          <sphereGeometry args={[0.2, 10, 10]} />
          <meshBasicMaterial color={MONO_EYE} transparent opacity={0.4} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        {([-0.2, 0.2] as const).map((x) => (
          <mesh key={x} position={[x, 2.25, 0.25]} rotation={[0.9, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.5, 8]} />
            <meshStandardMaterial color={PIPE} />
          </mesh>
        ))}
      </group>
      {/* ロックオン表示 */}
      <group ref={marker} position={[0, 3.7, 0]}>
        <mesh>
          <torusGeometry args={[0.55, 0.04, 6, 4]} />
          <meshBasicMaterial color={LOCK} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <torusGeometry args={[0.35, 0.03, 6, 4]} />
          <meshBasicMaterial color={LOCK} />
        </mesh>
      </group>
    </group>
  );
}
