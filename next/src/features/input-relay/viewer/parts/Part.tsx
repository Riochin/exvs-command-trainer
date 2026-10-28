'use client';

/**
 * 機体モデルを組む部品と、機体によらない色。機体ごとの色は UnitLook（sim/units/types.ts）に持たせる。
 */

export const GREY = '#9aa1ab';
export const DARK = '#2f3238';
export const EYE = '#59ff8a';
export const THRUST = '#7ef9ff';
export const SABER = '#ff5fd2';
export const SEED_AURA = '#ff8fd0';
export const BLADE = '#c9d1db';

/** 箱 1 つ。機体はこれを組み合わせて作る */
export function Part({
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
