'use client';

/**
 * アシスト（ムラサメ・フリーダム・エスビット・GFreD）と射出したオオトリの描画。
 * 数が少ないので種類ごとに決まった数のメッシュを用意し、sim の並びに合わせて割り当てる。
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { AssistKind } from '../sim/actions';
import type { SimWorld } from '../sim/types';

const POOL: Readonly<Record<AssistKind, number>> = {
  murasame: 2,
  'freedom-shot': 1,
  'freedom-melee': 1,
  ootori: 1,
  esbit: 2,
  'gfred-shot': 1,
  'gfred-melee': 1,
};

function Box({ args, position, color, rotation }: { args: [number, number, number]; position: [number, number, number]; color: string; rotation?: [number, number, number] }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}

/** ムラサメ（戦闘機形態）: 白い機首と灰色の翼 */
function Murasame() {
  return (
    <group scale={0.9}>
      <Box args={[0.35, 0.3, 1.8]} position={[0, 0, 0]} color="#e9ecf2" />
      <Box args={[2.2, 0.08, 0.7]} position={[0, 0, -0.2]} color="#8c95a3" />
      <Box args={[0.08, 0.5, 0.5]} position={[0, 0.3, -0.7]} color="#2a3a8c" />
    </group>
  );
}

/** フリーダム: 白い体に青い翼の小さな人型 */
function Freedom() {
  return (
    <group scale={0.75}>
      <Box args={[0.9, 0.9, 0.55]} position={[0, 1.8, 0]} color="#2a4fd0" />
      <Box args={[0.35, 0.35, 0.35]} position={[0, 2.45, 0]} color="#f2f3f6" />
      <Box args={[0.8, 1.2, 0.45]} position={[0, 0.9, 0]} color="#f2f3f6" />
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <Box args={[0.25, 1.0, 0.25]} position={[side * 0.65, 1.7, 0]} color="#f2f3f6" />
          <Box args={[0.15, 1.8, 0.5]} position={[side * 0.9, 2.2, -0.5]} rotation={[0, 0, side * -0.5]} color="#2a4fd0" />
        </group>
      ))}
    </group>
  );
}

/** 射出したオオトリ: 赤い胴と白い翼 */
function Ootori() {
  return (
    <group>
      <Box args={[0.6, 0.4, 1.4]} position={[0, 0, 0]} color="#e5557f" />
      <Box args={[3.2, 0.1, 0.9]} position={[0, 0.1, -0.1]} color="#f2f2f4" />
      {([-1, 1] as const).map((side) => (
        <Box key={side} args={[0.16, 0.16, 2]} position={[side * 0.45, 0.25, 0.4]} color="#2f3340" />
      ))}
    </group>
  );
}

/** エスビット: 先の尖った小さなビット。根元が淡く光る */
function Esbit() {
  return (
    <group scale={0.8}>
      <Box args={[0.35, 0.35, 0.9]} position={[0, 0, 0]} color="#e9ecf2" />
      <Box args={[0.22, 0.22, 0.5]} position={[0, 0, 0.6]} color="#3b4a9c" />
      <mesh position={[0, 0, -0.5]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshBasicMaterial color="#8fd3ff" />
      </mesh>
    </group>
  );
}

/** GFreD: 白い体に紫の胸と肩、細身の人型 */
function GFreD() {
  return (
    <group scale={0.75}>
      <Box args={[0.85, 0.8, 0.5]} position={[0, 1.8, 0]} color="#6a4fa8" />
      <Box args={[0.32, 0.32, 0.32]} position={[0, 2.4, 0]} color="#f2f3f6" />
      <Box args={[0.7, 1.2, 0.4]} position={[0, 0.9, 0]} color="#f2f3f6" />
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <Box args={[0.4, 0.3, 0.45]} position={[side * 0.6, 2.1, 0]} color="#6a4fa8" />
          <Box args={[0.22, 1.0, 0.22]} position={[side * 0.62, 1.55, 0]} color="#f2f3f6" />
        </group>
      ))}
    </group>
  );
}

const MODELS: Readonly<Record<AssistKind, () => React.JSX.Element>> = {
  murasame: Murasame,
  'freedom-shot': Freedom,
  'freedom-melee': Freedom,
  ootori: Ootori,
  esbit: Esbit,
  'gfred-shot': GFreD,
  'gfred-melee': GFreD,
};

export function Assists({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const groups = useRef<Partial<Record<AssistKind, (Group | null)[]>>>({});

  useFrame(() => {
    const assists = worldRef.current.assists;
    for (const kind of Object.keys(POOL) as AssistKind[]) {
      const list = assists.filter((a) => a.kind === kind);
      const slots = groups.current[kind] ?? [];
      slots.forEach((group, i) => {
        if (!group) return;
        const a = list[i];
        group.visible = a !== undefined;
        if (!a) return;
        group.position.set(a.pos.x, a.pos.y, a.pos.z);
        group.rotation.y = a.yaw;
        // 出始めと消え際は小さく
        const fade = Math.min(1, a.age / 0.15, (a.life - a.age) / 0.15);
        group.scale.setScalar(Math.max(0.05, fade));
      });
    }
  });

  return (
    <group>
      {(Object.keys(POOL) as AssistKind[]).map((kind) => {
        const Model = MODELS[kind];
        return Array.from({ length: POOL[kind] }, (_, i) => (
          <group
            key={`${kind}-${i}`}
            visible={false}
            ref={(el) => {
              const slots = groups.current[kind] ?? (groups.current[kind] = []);
              slots[i] = el;
            }}
          >
            <Model />
          </group>
        ));
      })}
    </group>
  );
}
