'use client';

/**
 * 弾の描画。弾の増減で React の再描画が起きないよう、決まった数のメッシュを用意して
 * 毎フレーム位置・向き・見た目を割り当て、余りは隠す。
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Mesh, type MeshBasicMaterial } from 'three';
import type { ProjectileKind, SimWorld } from '../sim/types';

const POOL_SIZE = 48;
const UP = new Vector3(0, 1, 0);
const direction = new Vector3();

const LOOKS: Readonly<Record<ProjectileKind, { color: string; length: number; width: number }>> = {
  beam: { color: '#ff7ad9', length: 6, width: 0.18 },
  missile: { color: '#ffd166', length: 0.9, width: 0.3 },
  'big-beam': { color: '#ffef7a', length: 10, width: 0.6 },
  'cs-beam': { color: '#7ef9ff', length: 14, width: 0.9 },
};

export function Projectiles({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const meshes = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    const projectiles = worldRef.current.projectiles;
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = meshes.current[i];
      if (!mesh) continue;
      const p = projectiles[i];
      if (!p) {
        mesh.visible = false;
        continue;
      }
      const look = LOOKS[p.kind];
      mesh.visible = true;
      mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      direction.set(p.vel.x, p.vel.y, p.vel.z).normalize();
      mesh.quaternion.setFromUnitVectors(UP, direction);
      mesh.scale.set(look.width, look.length, look.width);
      (mesh.material as MeshBasicMaterial).color.set(look.color);
    }
  });

  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          visible={false}
        >
          {/* 半径・高さ 1 の円柱を、弾の種類ごとの太さと長さに伸縮させて使う */}
          <cylinderGeometry args={[1, 1, 1, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}
