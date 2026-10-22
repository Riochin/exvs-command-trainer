'use client';

/**
 * 弾の描画。弾の増減で React の再描画が起きないよう、決まった数のメッシュを用意して
 * 毎フレーム位置・向き・見た目を割り当て、余りは隠す。
 *
 * ビームは白い芯と色付きの外殻を加算合成で重ね、光って見えるようにする。
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { ProjectileKind, SimWorld } from '../sim/types';

const POOL_SIZE = 48;
const UP = new Vector3(0, 1, 0);
const direction = new Vector3();

const LOOKS: Readonly<Record<ProjectileKind, { color: string; length: number; width: number }>> = {
  beam: { color: '#ff5fd2', length: 7, width: 0.2 },
  missile: { color: '#ffb347', length: 1.0, width: 0.22 },
  'big-beam': { color: '#ffe066', length: 12, width: 0.7 },
  'cs-beam': { color: '#7ef9ff', length: 16, width: 1.0 },
  'enemy-beam': { color: '#b6ff5e', length: 6, width: 0.22 },
};

export function Projectiles({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const groups = useRef<(Group | null)[]>([]);
  const glows = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    const projectiles = worldRef.current.projectiles;
    for (let i = 0; i < POOL_SIZE; i++) {
      const group = groups.current[i];
      if (!group) continue;
      const p = projectiles[i];
      if (!p) {
        group.visible = false;
        continue;
      }
      const look = LOOKS[p.kind];
      group.visible = true;
      group.position.set(p.pos.x, p.pos.y, p.pos.z);
      direction.set(p.vel.x, p.vel.y, p.vel.z).normalize();
      group.quaternion.setFromUnitVectors(UP, direction);
      group.scale.set(look.width, look.length, look.width);
      const glow = glows.current[i];
      if (glow) (glow.material as MeshBasicMaterial).color.set(look.color);
    }
  });

  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          {/* 半径・高さ 1 の円柱を、弾の種類ごとの太さと長さに伸縮させて使う */}
          <mesh>
            <cylinderGeometry args={[0.45, 0.45, 1, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh
            ref={(el) => {
              glows.current[i] = el;
            }}
          >
            <cylinderGeometry args={[1, 1, 1.05, 12]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
