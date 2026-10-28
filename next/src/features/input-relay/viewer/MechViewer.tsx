'use client';

/**
 * PC 側の 3D ビュー。three を使うので `next/dynamic`（ssr:false）で読み込む前提。
 *
 * sim の world は親が ref で持ち、入力はそこへ直接適用される。ここでは毎フレーム
 * 固定刻みで sim を進め、各部品がその状態を読んで描画する。
 */
import { useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { BackSide, Color, PerspectiveCamera, Vector3, type DirectionalLight } from 'three';
import { advanceWorld } from '../sim/step';
import type { SimWorld } from '../sim/types';
import { unitById } from '../sim/units';
import { Assists } from './Assists';
import { Effects } from './Effects';
import { EnemyDummy } from './EnemyDummy';
import { MechModel } from './MechModel';
import { Projectiles } from './Projectiles';

const SKY_TOP = '#3d6fb6';
const SKY_HORIZON = '#c9d8e6';
const GROUND = '#5d6b58';
const BASE_FOV = 55;

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

/**
 * 機体の後ろ上から、機体と敵を結ぶ方向を見る（EXVS の三人称視点）。
 * BD 中は画角を広げて速さを出し、敵に当たった瞬間は少し揺らす。
 */
function CameraRig({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  useFrame(({ camera, clock }) => {
    const { mech, enemy } = worldRef.current;
    // 真後ろだと機体が敵を隠すので、少し横にずらす
    const back = 13;
    const side = 2.2;
    // 機体の向きではなく敵の方向を基準にする（BD で後ろを向いても画面は敵を見続ける）
    const sinYaw = Math.sin(mech.lockYaw);
    const cosYaw = Math.cos(mech.lockYaw);
    cameraTarget.set(
      mech.pos.x - sinYaw * back - cosYaw * side,
      mech.pos.y + 5.5,
      mech.pos.z - cosYaw * back + sinYaw * side,
    );
    camera.position.lerp(cameraTarget, 0.12);

    const shake = enemy.hitFlash > 0 ? enemy.hitFlash * 0.5 : 0;
    if (shake > 0) {
      camera.position.x += Math.sin(clock.elapsedTime * 90) * shake;
      camera.position.y += Math.cos(clock.elapsedTime * 110) * shake;
    }

    lookTarget.set(
      mech.pos.x + (enemy.pos.x - mech.pos.x) * 0.5,
      mech.pos.y + 1.5 + (enemy.pos.y - mech.pos.y) * 0.5,
      mech.pos.z + (enemy.pos.z - mech.pos.z) * 0.5,
    );
    camera.lookAt(lookTarget);

    if (camera instanceof PerspectiveCamera) {
      const fov = mech.action === 'bd' ? BASE_FOV + 8 : BASE_FOV;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * 0.1;
        camera.updateProjectionMatrix();
      }
    }
  });
  return null;
}

/** 影を落とす平行光源を機体に追従させ、狭い範囲で精細な影にする */
function SunLight({ worldRef }: { worldRef: RefObject<SimWorld> }) {
  const light = useRef<DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const { pos } = worldRef.current.mech;
    l.position.set(pos.x + 25, pos.y + 45, pos.z + 20);
    l.target.position.set(pos.x, pos.y, pos.z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      intensity={2.2}
      color="#fff3e0"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-40}
      shadow-camera-right={40}
      shadow-camera-top={40}
      shadow-camera-bottom={-40}
      shadow-camera-far={150}
      shadow-bias={-0.0005}
    />
  );
}

/** 上が濃い青、地平線が白っぽい空。大きな球の内側に頂点色で塗る */
function Sky() {
  const colors = useMemo(() => {
    const top = new Color(SKY_TOP);
    const horizon = new Color(SKY_HORIZON);
    return { top, horizon };
  }, []);
  return (
    <mesh scale={400}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={{ top: { value: colors.top }, horizon: { value: colors.horizon } }}
        vertexShader={`varying float vHeight; void main() { vHeight = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform vec3 top; uniform vec3 horizon; varying float vHeight; void main() { gl_FragColor = vec4(mix(horizon, top, clamp(vHeight * 1.6, 0.0, 1.0)), 1.0); }`}
      />
    </mesh>
  );
}

export function MechViewer({ worldRef, unitId }: { worldRef: RefObject<SimWorld>; unitId: string }) {
  const look = unitById(unitId).look;
  return (
    <Canvas shadows camera={{ fov: BASE_FOV, near: 0.1, far: 900, position: [0, 5.5, 13] }}>
      <SimDriver worldRef={worldRef} />
      <CameraRig worldRef={worldRef} />
      <fog attach="fog" args={[SKY_HORIZON, 90, 320]} />
      <Sky />
      <hemisphereLight args={['#dbe9ff', '#4a5240', 0.9]} />
      <SunLight worldRef={worldRef} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color={GROUND} roughness={1} />
      </mesh>
      <gridHelper args={[900, 180, '#36412f', '#414c3b']} position={[0, 0.01, 0]} />
      <MechModel key={unitId} worldRef={worldRef} look={look} />
      <Assists worldRef={worldRef} />
      <EnemyDummy worldRef={worldRef} />
      <Projectiles worldRef={worldRef} />
      <Effects worldRef={worldRef} />
    </Canvas>
  );
}
