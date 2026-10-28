'use client';

/**
 * sim が出す一瞬の効果（命中の爆発・発射炎・着地の土煙・斬撃の閃き・盾の成立）の描画。
 * 弾と同じく決まった数のメッシュを使い回し、寿命の進みに合わせて広げて薄くする。
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Mesh, type MeshBasicMaterial } from 'three';
import type { EffectKind, SimWorld } from '../sim/types';

const POOL_SIZE = 24;

const LOOKS: Readonly<Record<EffectKind, { color: string; from: number; to: number; opacity: number; flat: boolean }>> = {
  hit: { color: '#ffb347', from: 0.8, to: 3.2, opacity: 0.9, flat: false },
  muzzle: { color: '#fff4c2', from: 0.4, to: 1.0, opacity: 1, flat: false },
  land: { color: '#c9c2b0', from: 0.6, to: 3.5, opacity: 0.6, flat: true },
  slash: { color: '#ff5fd2', from: 1.0, to: 2.4, opacity: 0.7, flat: false },
  // 盾が成立したときの緑の閃き
  guard: { color: '#5dff9a', from: 0.8, to: 2.6, opacity: 0.8, flat: false },
};

export function Effects({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const spheres = useRef<(Mesh | null)[]>([]);
  const rings = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    const effects = worldRef.current.effects;
    for (let i = 0; i < POOL_SIZE; i++) {
      const sphere = spheres.current[i];
      const ring = rings.current[i];
      if (!sphere || !ring) continue;
      const e = effects[i];
      if (!e) {
        sphere.visible = false;
        ring.visible = false;
        continue;
      }
      const look = LOOKS[e.kind];
      const k = Math.min(1, e.age / e.life);
      const size = look.from + (look.to - look.from) * k;
      const opacity = look.opacity * (1 - k);
      const target = look.flat ? ring : sphere;
      const other = look.flat ? sphere : ring;
      other.visible = false;
      target.visible = true;
      target.position.set(e.pos.x, e.pos.y + (look.flat ? 0.05 : 0), e.pos.z);
      target.scale.setScalar(size);
      const material = target.material as MeshBasicMaterial;
      material.color.set(look.color);
      material.opacity = opacity;
    }
  });

  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              spheres.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[0.5, 16, 12]} />
            <meshBasicMaterial transparent blending={AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh
            ref={(el) => {
              rings.current[i] = el;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
          >
            <ringGeometry args={[0.35, 0.5, 32]} />
            <meshBasicMaterial transparent depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
