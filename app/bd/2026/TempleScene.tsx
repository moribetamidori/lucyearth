'use client';

import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import {
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Html,
  Lightformer,
  MeshReflectorMaterial,
  PointerLockControls,
  Sparkles,
} from '@react-three/drei';
import {
  type ComponentRef,
  type MutableRefObject,
  Suspense,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {
  MobileMovementInput,
  TempleCluster,
  TempleDataset,
  TempleFocus,
  TempleInstallationKind,
  TempleLetter,
  TempleMaterialMode,
  TempleTweetMemory,
  TempleZone,
} from '@/lib/birthday/temple-types';

export type TempleTeleport = {
  nonce: number;
  position: [number, number, number];
  lookAt?: [number, number, number];
};

type TempleSceneProps = {
  dataset: TempleDataset;
  activeZoneId: string | null;
  mode: TempleMaterialMode;
  replayKey: number;
  started: boolean;
  transporting: boolean;
  skipReveal: boolean;
  panelOpen: boolean;
  mobile: boolean;
  reducedMotion: boolean;
  finalUnlocked: boolean;
  collectedLetterCount: number;
  letterAssignments: TempleLetter[];
  collectedLetterZoneIds: Set<string>;
  focused: TempleFocus;
  teleport: TempleTeleport | null;
  mobileInput: MutableRefObject<MobileMovementInput>;
  onFocus: (focus: TempleFocus) => void;
  onMemorySelect: (memoryId: string) => void;
  onLetterCollect: (zoneId: string) => void;
  onZoneEnter: (zoneId: string | null) => void;
  onFinalSelect: () => void;
  onObservatorySelect: () => void;
  onCinematicComplete: () => void;
};

type RevealContextValue = {
  progress: MutableRefObject<number>;
};

const RevealContext = createContext<RevealContextValue | null>(null);

function useReveal() {
  const value = useContext(RevealContext);
  if (!value) throw new Error('Temple reveal context is missing');
  return value;
}

function smoothstep(min: number, max: number, value: number) {
  const normalized = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function RevealDirector({
  mode,
  replayKey,
  reducedMotion,
}: Pick<TempleSceneProps, 'mode' | 'replayKey' | 'reducedMotion'>) {
  const { progress } = useReveal();
  const target = useRef(mode === 'pearl' ? 1 : 0);
  const replaySeen = useRef(replayKey);

  useEffect(() => {
    target.current = mode === 'pearl' ? 1 : 0;
    if (reducedMotion) progress.current = target.current;
  }, [mode, progress, reducedMotion]);

  useEffect(() => {
    if (replaySeen.current === replayKey) return;
    replaySeen.current = replayKey;
    progress.current = 0;
    target.current = 1;
  }, [progress, replayKey]);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const direction = Math.sign(target.current - progress.current);
    if (!direction) return;
    progress.current = THREE.MathUtils.clamp(
      progress.current + direction * delta / 6,
      0,
      1
    );
  });

  return null;
}

type PieceProps = {
  geometry: THREE.BufferGeometry;
  phase: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  wireColor?: string;
  gold?: boolean;
  castShadow?: boolean;
};

function TemplePiece({
  geometry,
  phase,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  color = '#eefcff',
  wireColor = '#71efff',
  gold = false,
  castShadow = true,
}: PieceProps) {
  const { progress } = useReveal();
  const solidMesh = useRef<THREE.Mesh>(null);
  const wireMesh = useRef<THREE.Mesh>(null);
  const edgeLines = useRef<THREE.LineSegments>(null);
  const solid = useRef<THREE.MeshPhysicalMaterial>(null);
  const wire = useRef<THREE.MeshBasicMaterial>(null);
  const edge = useRef<THREE.LineBasicMaterial>(null);
  const edgeGeometry = useGeometry(
    useMemo(() => new THREE.EdgesGeometry(geometry, 26), [geometry])
  );

  useFrame(() => {
    const local = smoothstep(phase, Math.min(1, phase + 0.16), progress.current);
    const band = Math.max(0, 1 - Math.abs(local - 0.5) * 4);
    if (solidMesh.current) solidMesh.current.visible = local > 0.006;
    if (wireMesh.current) wireMesh.current.visible = local < 0.995;
    if (edgeLines.current) edgeLines.current.visible = local < 0.998;
    if (solid.current) {
      solid.current.opacity = local;
      solid.current.emissiveIntensity = 0.04 + band * 1.65;
    }
    if (wire.current) wire.current.opacity = (1 - local) * 0.34;
    if (edge.current) edge.current.opacity = (1 - local) * (0.88 + band * 0.12);
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh ref={solidMesh} geometry={geometry} castShadow={castShadow} receiveShadow>
        <meshPhysicalMaterial
          ref={solid}
          color={gold ? '#d4a94e' : color}
          emissive={gold ? '#6b4313' : '#63d9eb'}
          metalness={gold ? 0.72 : 0.18}
          roughness={gold ? 0.24 : 0.2}
          clearcoat={gold ? 0.72 : 1}
          clearcoatRoughness={0.16}
          transparent
          opacity={0}
          depthWrite
        />
      </mesh>
      <mesh ref={wireMesh} geometry={geometry} scale={1.002}>
        <meshBasicMaterial
          ref={wire}
          color={gold ? '#ffe27f' : wireColor}
          wireframe
          transparent
          opacity={0.34}
          depthWrite={false}
        />
      </mesh>
      <lineSegments ref={edgeLines} geometry={edgeGeometry} scale={1.006}>
        <lineBasicMaterial
          ref={edge}
          color={gold ? '#fff0a6' : '#a6f7ff'}
          transparent
          opacity={0.88}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
}

function useGeometry<T extends THREE.BufferGeometry>(geometry: T) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function BoxPiece({ size, ...props }: Omit<PieceProps, 'geometry'> & { size: [number, number, number] }) {
  const [width, height, depth] = size;
  const geometry = useGeometry(
    useMemo(() => {
      const smallestSide = Math.min(width, height, depth);
      if (smallestSide < 0.16) return new THREE.BoxGeometry(width, height, depth);
      const radius = Math.min(0.12, smallestSide * 0.22);
      return new RoundedBoxGeometry(width, height, depth, 3, radius);
    }, [depth, height, width])
  );
  return <TemplePiece geometry={geometry} {...props} />;
}

function CylinderPiece({
  args,
  ...props
}: Omit<PieceProps, 'geometry'> & { args: [number, number, number, number] }) {
  const [radiusTop, radiusBottom, height, requestedSegments] = args;
  const radialSegments = Math.max(18, requestedSegments);
  const geometry = useGeometry(
    useMemo(
      () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 3),
      [height, radialSegments, radiusBottom, radiusTop]
    )
  );
  return <TemplePiece geometry={geometry} {...props} />;
}

function ConePiece({
  args,
  ...props
}: Omit<PieceProps, 'geometry'> & { args: [number, number, number] }) {
  const [radius, height, requestedSegments] = args;
  const radialSegments = Math.max(18, requestedSegments);
  const geometry = useGeometry(
    useMemo(() => new THREE.ConeGeometry(radius, height, radialSegments, 3), [height, radialSegments, radius])
  );
  return <TemplePiece geometry={geometry} {...props} />;
}

function TorusPiece({
  args,
  ...props
}: Omit<PieceProps, 'geometry'> & { args: [number, number, number, number, number?] }) {
  const [radius, tube, requestedRadialSegments, requestedTubularSegments, arc = Math.PI * 2] = args;
  const radialSegments = Math.max(12, requestedRadialSegments);
  const tubularSegments = Math.max(64, requestedTubularSegments);
  const geometry = useGeometry(
    useMemo(
      () => new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc),
      [arc, radialSegments, radius, tube, tubularSegments]
    )
  );
  return <TemplePiece geometry={geometry} {...props} />;
}

function SpherePiece({
  radius,
  ...props
}: Omit<PieceProps, 'geometry'> & { radius: number }) {
  const geometry = useGeometry(
    useMemo(() => new THREE.IcosahedronGeometry(radius, 2), [radius])
  );
  return <TemplePiece geometry={geometry} {...props} />;
}

function HeartPiece(props: Omit<PieceProps, 'geometry'>) {
  const geometry = useGeometry(
    useMemo(() => {
      const heart = new THREE.Shape();
      heart.moveTo(0, -0.42);
      heart.bezierCurveTo(-0.08, -0.24, -0.46, -0.03, -0.46, 0.27);
      heart.bezierCurveTo(-0.46, 0.58, -0.08, 0.66, 0, 0.36);
      heart.bezierCurveTo(0.08, 0.66, 0.46, 0.58, 0.46, 0.27);
      heart.bezierCurveTo(0.46, -0.03, 0.08, -0.24, 0, -0.42);
      const result = new THREE.ExtrudeGeometry(heart, {
        depth: 0.12,
        bevelEnabled: true,
        bevelSegments: 3,
        bevelSize: 0.035,
        bevelThickness: 0.025,
        curveSegments: 18,
      });
      result.center();
      return result;
    }, [])
  );
  return <TemplePiece geometry={geometry} {...props} />;
}

function AltarFlower({
  position,
  color,
  phase,
  scale = 1,
}: {
  position: [number, number, number];
  color: string;
  phase: number;
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2;
        return (
          <SpherePiece
            key={index}
            radius={0.16}
            position={[Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, 0]}
            rotation={[0, 0, angle]}
            scale={[1.05, 0.45, 0.32]}
            phase={phase + index * 0.004}
            color={color}
            wireColor="#fff0c4"
            castShadow={false}
          />
        );
      })}
      <SpherePiece
        radius={0.09}
        phase={phase + 0.03}
        color="#ffd96c"
        wireColor="#fff0a6"
        gold
        castShadow={false}
      />
    </group>
  );
}

function AngelWing({ side }: { side: -1 | 1 }) {
  return (
    <group position={[side * 0.48, 1.58, -0.24]}>
      {Array.from({ length: 7 }, (_, index) => {
        const length = 1.15 - index * 0.065;
        return (
          <SpherePiece
            key={index}
            radius={0.46}
            position={[side * (0.18 + index * 0.19), 0.3 - index * 0.075, -index * 0.012]}
            rotation={[0, side * 0.06, side * (-0.7 + index * 0.085)]}
            scale={[0.31, length, 0.16]}
            phase={0.64 + index * 0.012}
            color={index % 2 === 0 ? '#f5fbf8' : '#e8f2f5'}
            wireColor="#d8f9ff"
            castShadow={false}
          />
        );
      })}
      <TorusPiece
        args={[0.7, 0.035, 12, 72, Math.PI * 0.86]}
        position={[side * 0.58, 0.25, -0.01]}
        rotation={[0, side > 0 ? 0 : Math.PI, side * -0.48]}
        phase={0.65}
        color="#fff8df"
        wireColor="#fff0a6"
        gold
        castShadow={false}
      />
    </group>
  );
}

function TempleHall({
  position,
  size,
  phase,
  gold = false,
  tall = false,
}: {
  position: [number, number, number];
  size: [number, number];
  phase: number;
  gold?: boolean;
  tall?: boolean;
}) {
  const [width, depth] = size;
  const height = tall ? 5.6 : 4.1;
  const columnXs = [-width * 0.38, -width * 0.13, width * 0.13, width * 0.38];
  const roofScale: [number, number, number] = [1, 1, depth / width];

  return (
    <group position={position}>
      <BoxPiece size={[width + 1.2, 0.35, depth + 1.2]} position={[0, 0.18, 0]} phase={phase} gold={gold} />
      <BoxPiece size={[width + 0.5, 0.25, depth + 0.5]} position={[0, 0.48, 0]} phase={phase + 0.015} gold={gold} />
      <BoxPiece size={[width, 0.18, depth]} position={[0, 0.64, 0]} phase={phase + 0.025} gold={gold} />

      {columnXs.flatMap((x) =>
        [-depth * 0.38, depth * 0.38].map((z) => (
          <group key={`${x}-${z}`}>
            <CylinderPiece
              args={[0.18, 0.25, height, 18]}
              position={[x, 0.65 + height / 2, z]}
              phase={phase + 0.04}
              gold={gold}
            />
            <CylinderPiece
              args={[0.31, 0.36, 0.28, 20]}
              position={[x, 0.78, z]}
              phase={phase + 0.032}
              gold={gold}
            />
            <TorusPiece
              args={[0.25, 0.055, 12, 64]}
              position={[x, 0.98, z]}
              rotation={[Math.PI / 2, 0, 0]}
              phase={phase + 0.04}
              gold={gold}
            />
            <CylinderPiece
              args={[0.33, 0.22, 0.32, 20]}
              position={[x, 0.65 + height - 0.14, z]}
              phase={phase + 0.052}
              gold={gold}
            />
          </group>
        ))
      )}

      <BoxPiece
        size={[width - 0.7, height * 0.72, 0.22]}
        position={[0, 0.65 + height * 0.36, -depth * 0.39]}
        phase={phase + 0.055}
        gold={gold}
      />
      <BoxPiece
        size={[0.2, height * 0.64, depth * 0.72]}
        position={[-width * 0.39, 0.65 + height * 0.32, 0]}
        phase={phase + 0.055}
        gold={gold}
      />

      <BoxPiece
        size={[width * 1.12, 0.16, depth * 1.12]}
        position={[0, height + 0.12, 0]}
        phase={phase + 0.072}
        gold={gold}
      />
      <BoxPiece
        size={[width * 0.94, 0.13, depth * 0.92]}
        position={[0, height + 1.23, -0.12]}
        phase={phase + 0.094}
        gold={gold}
      />

      {[-0.25, 0, 0.25].map((offset) => (
        <group
          key={`medallion-${offset}`}
          position={[offset * width, height * 0.58, -depth * 0.405 - 0.13]}
        >
          <TorusPiece
            args={[0.44, 0.055, 12, 64]}
            phase={phase + 0.068}
            gold={gold}
          />
          <SpherePiece radius={0.16} phase={phase + 0.074} gold={gold} />
        </group>
      ))}
      <BoxPiece
        size={[0.2, height * 0.64, depth * 0.72]}
        position={[width * 0.39, 0.65 + height * 0.32, 0]}
        phase={phase + 0.055}
        gold={gold}
      />

      <ConePiece
        args={[width * 0.77, 2.3, 4]}
        position={[0, height + 0.75, 0]}
        rotation={[0, Math.PI / 4, 0]}
        scale={roofScale}
        phase={phase + 0.085}
        gold={gold}
      />
      <ConePiece
        args={[width * 0.61, 1.7, 4]}
        position={[0, height + 2.1, -0.25]}
        rotation={[0, Math.PI / 4, 0]}
        scale={[1, 1, depth / width * 0.88]}
        phase={phase + 0.105}
        gold={gold}
      />

      {[-1, 1].flatMap((sideX) =>
        [-1, 1].map((sideZ) => (
          <group
            key={`roof-corner-${sideX}-${sideZ}`}
            position={[sideX * width * 0.53, height + 1.18, sideZ * depth * 0.5]}
            rotation={[sideZ * 0.16, 0, sideX * -0.34]}
          >
            <ConePiece
              args={[0.16, 2.35, 18]}
              phase={phase + 0.112}
              gold={gold}
            />
            <SpherePiece
              radius={0.13}
              position={[0, -0.86, 0]}
              phase={phase + 0.108}
              gold={gold}
            />
          </group>
        ))
      )}

      {[-0.32, 0, 0.32].map((offset) => (
        <group key={`ridge-${offset}`} position={[offset * width, height + 3.15, -0.35]}>
          <SpherePiece radius={0.15} phase={phase + 0.118} gold={gold} />
          <ConePiece
            args={[0.12, 1.25 + (offset === 0 ? 0.45 : 0), 18]}
            position={[0, 0.72, 0]}
            phase={phase + 0.122}
            gold={gold}
          />
        </group>
      ))}
      <ConePiece
        args={[0.52, tall ? 5.2 : 3.6, 8]}
        position={[0, height + (tall ? 5.3 : 4.05), -0.45]}
        phase={phase + 0.125}
        gold={gold}
      />

      {[-1, 1].map((side) => (
        <group key={side} position={[side * width * 0.48, height + 1.8, 0]} rotation={[0, 0, side * -0.48]}>
          <ConePiece args={[0.22, 3.8, 7]} phase={phase + 0.12} gold={gold} />
        </group>
      ))}
    </group>
  );
}

function HeavenGate() {
  const phase = 0.2;
  return (
    <group position={[0, 0, 6]}>
      {[-2.2, 2.2].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <BoxPiece size={[1.2, 0.4, 1.5]} position={[0, 0.2, 0]} phase={phase} />
          <CylinderPiece args={[0.42, 0.54, 5.5, 24]} position={[0, 3.05, 0]} phase={phase + 0.03} />
          <CylinderPiece args={[0.66, 0.76, 0.32, 24]} position={[0, 0.58, 0]} phase={phase + 0.018} />
          <TorusPiece args={[0.48, 0.08, 14, 72]} position={[0, 5.48, 0]} rotation={[Math.PI / 2, 0, 0]} phase={phase + 0.052} />
          <CylinderPiece args={[0.7, 0.46, 0.38, 24]} position={[0, 5.68, 0]} phase={phase + 0.058} />
          <ConePiece args={[1.15, 2.5, 24]} position={[0, 6.55, 0]} phase={phase + 0.08} />
          <SpherePiece radius={0.24} position={[0, 7.82, 0]} phase={phase + 0.09} />
          <ConePiece args={[0.2, 2.8, 24]} position={[0, 8.75, 0]} phase={phase + 0.1} />
        </group>
      ))}
      <TorusPiece
        args={[2.2, 0.18, 8, 48, Math.PI]}
        position={[0, 3.25, 0]}
        phase={phase + 0.06}
      />
      <BoxPiece size={[5.6, 0.28, 1.1]} position={[0, 5.25, 0]} phase={phase + 0.07} />
      <ConePiece
        args={[3.3, 1.8, 4]}
        position={[0, 6.25, 0]}
        rotation={[0, Math.PI / 4, 0]}
        scale={[1, 1, 0.42]}
        phase={phase + 0.09}
      />
      {[-1.45, 0, 1.45].map((x) => (
        <group key={`gate-filigree-${x}`} position={[x, 5.86 + (x === 0 ? 0.42 : 0), 0.58]}>
          <TorusPiece args={[0.28, 0.045, 12, 64]} phase={phase + 0.092} />
          <ConePiece args={[0.08, 0.72, 18]} position={[0, 0.48, 0]} phase={phase + 0.098} />
        </group>
      ))}
    </group>
  );
}

function ObservatoryTelescope({
  enabled,
  focused,
  mobile,
  onFocus,
}: {
  enabled: boolean;
  focused: boolean;
  mobile: boolean;
  onFocus: (focus: TempleFocus) => void;
}) {
  const phase = 0.31;
  const legAngles = [0.12, (Math.PI * 2) / 3 + 0.12, (Math.PI * 4) / 3 + 0.12];
  const orbHitArea = useRef<THREE.Mesh>(null);
  const orbGlow = useRef<THREE.Group>(null);
  const orbOrbit = useRef<THREE.Group>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const raycastElapsed = useRef(0);
  const { camera, gl } = useThree();
  const hovered = focused;

  useEffect(() => {
    if (!enabled && focused) onFocus(null);
  }, [enabled, focused, onFocus]);

  useFrame((state, delta) => {
    if (orbGlow.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.2) * (hovered ? 0.055 : 0.025);
      orbGlow.current.scale.setScalar(pulse);
    }
    if (orbOrbit.current) {
      orbOrbit.current.rotation.y = state.clock.elapsedTime * 0.72;
      orbOrbit.current.rotation.z = state.clock.elapsedTime * 0.34;
    }

    if (!enabled || !orbHitArea.current) return;
    const crosshairAiming = mobile || document.pointerLockElement === gl.domElement;
    if (!crosshairAiming) return;
    raycastElapsed.current += delta;
    if (raycastElapsed.current < 1 / 20) return;
    raycastElapsed.current = 0;
    raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
    const aimedAtOrb = raycaster.current.intersectObject(orbHitArea.current, false).length > 0;
    if (aimedAtOrb && !focused) {
      onFocus({ kind: 'telescope', id: 'observatory-telescope' });
    } else if (!aimedAtOrb && focused) {
      onFocus(null);
    }
  });

  return (
    <group
      position={[0.95, 0, 2.05]}
      rotation={[0, -0.12, 0]}
    >
      {legAngles.map((angle, index) => (
        <group key={angle} rotation={[0, angle, 0]}>
          <CylinderPiece
            args={[0.055, 0.085, 1.72, 18]}
            position={[0.39, 0.78, 0]}
            rotation={[0, 0, -2.67]}
            phase={phase + index * 0.006}
            color="#c9d8dc"
            wireColor="#6de8ff"
          />
          <BoxPiece
            size={[0.42, 0.09, 0.2]}
            position={[0.79, 0.07, 0]}
            rotation={[0, -0.08, 0]}
            phase={phase + 0.012 + index * 0.006}
            color="#b8c8cc"
          />
          <CylinderPiece
            args={[0.022, 0.03, 0.84, 14]}
            position={[0.24, 0.83, 0]}
            rotation={[0, 0, -2.36]}
            phase={phase + 0.02 + index * 0.006}
            gold
          />
        </group>
      ))}

      <CylinderPiece
        args={[0.2, 0.27, 0.72, 28]}
        position={[0, 1.22, 0]}
        phase={phase + 0.018}
        color="#c7d7da"
      />
      <CylinderPiece
        args={[0.34, 0.38, 0.18, 32]}
        position={[0, 1.57, 0]}
        phase={phase + 0.026}
        gold
      />
      <SpherePiece radius={0.31} position={[0, 1.78, 0]} phase={phase + 0.034} gold />
      <TorusPiece
        args={[0.34, 0.055, 14, 72]}
        position={[0, 1.78, 0]}
        phase={phase + 0.038}
        gold
      />
      <CylinderPiece
        args={[0.1, 0.1, 0.92, 20]}
        position={[-0.36, 1.48, 0]}
        rotation={[0, 0, 2.23]}
        phase={phase + 0.042}
        color="#9cadb2"
      />
      <CylinderPiece
        args={[0.21, 0.21, 0.19, 24]}
        position={[-0.72, 1.19, 0]}
        rotation={[0, 0, 2.23]}
        phase={phase + 0.048}
        color="#87999f"
      />

      <group
        position={[0, 2.02, 0]}
        rotation={[0.08, 0.24, -1.08]}
      >
        <BoxPiece
          size={[0.22, 0.92, 0.46]}
          position={[-0.32, 0.05, 0]}
          phase={phase + 0.046}
          gold
        />
        <TorusPiece
          args={[0.39, 0.07, 16, 80]}
          position={[0, -0.48, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          phase={phase + 0.054}
          gold
        />
        <TorusPiece
          args={[0.39, 0.07, 16, 80]}
          position={[0, 0.56, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          phase={phase + 0.06}
          gold
        />
        <CylinderPiece
          args={[0.3, 0.34, 2.42, 36]}
          position={[0, 0.18, 0]}
          phase={phase + 0.052}
          color="#e5eef0"
          wireColor="#82edff"
        />
        <CylinderPiece
          args={[0.39, 0.42, 0.58, 36]}
          position={[0, 1.42, 0]}
          phase={phase + 0.066}
          color="#d3dfe2"
        />
        <TorusPiece
          args={[0.4, 0.065, 16, 80]}
          position={[0, 1.72, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          phase={phase + 0.072}
          gold
        />
        <CylinderPiece
          args={[0.31, 0.31, 0.055, 36]}
          position={[0, 1.755, 0]}
          phase={phase + 0.078}
          color="#75b9cd"
          wireColor="#a5f5ff"
        />

        <CylinderPiece
          args={[0.25, 0.29, 0.34, 30]}
          position={[0, -1.18, 0]}
          phase={phase + 0.064}
          color="#aab9bd"
        />
        <CylinderPiece
          args={[0.13, 0.18, 0.3, 24]}
          position={[0, -1.49, 0]}
          phase={phase + 0.07}
          gold
        />
        <CylinderPiece
          args={[0.07, 0.1, 0.28, 20]}
          position={[0, -1.78, 0]}
          phase={phase + 0.076}
          color="#76878c"
        />
        <TorusPiece
          args={[0.14, 0.035, 12, 64]}
          position={[0, -1.62, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          phase={phase + 0.074}
          gold
        />

        <group position={[0, 0.34, 0.47]}>
          <CylinderPiece
            args={[0.095, 0.12, 1.18, 24]}
            phase={phase + 0.069}
            color="#a9bbc0"
          />
          <TorusPiece
            args={[0.125, 0.025, 10, 48]}
            position={[0, 0.61, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            phase={phase + 0.074}
            gold
          />
          <CylinderPiece
            args={[0.09, 0.09, 0.035, 24]}
            position={[0, 0.63, 0]}
            phase={phase + 0.08}
            color="#75b9cd"
          />
        </group>

        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.45, -0.62, 0]}>
            <CylinderPiece
              args={[0.11, 0.11, 0.2, 20]}
              rotation={[0, 0, Math.PI / 2]}
              phase={phase + 0.066}
              gold
            />
            <TorusPiece
              args={[0.13, 0.035, 10, 48]}
              position={[side * 0.11, 0, 0]}
              rotation={[0, Math.PI / 2, 0]}
              phase={phase + 0.07}
              gold
            />
          </group>
        ))}
        <group position={[0, -2.13, 0]}>
          <mesh
            ref={orbHitArea}
            onPointerMove={
              enabled
                ? (event) => {
                    event.stopPropagation();
                    if (!mobile && document.pointerLockElement !== gl.domElement) {
                      onFocus({ kind: 'telescope', id: 'observatory-telescope' });
                    }
                  }
                : undefined
            }
            onPointerOut={
              enabled
                ? (event) => {
                  event.stopPropagation();
                    if (!mobile && document.pointerLockElement !== gl.domElement && focused) {
                      onFocus(null);
                    }
                  }
                : undefined
            }
          >
            <sphereGeometry args={[0.21, 14, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>

          <group ref={orbGlow}>
            <mesh raycast={() => undefined}>
              <sphereGeometry args={[0.082, 20, 14]} />
              <meshBasicMaterial
                color="#f5ffff"
                toneMapped={false}
              />
            </mesh>
            <mesh raycast={() => undefined}>
              <sphereGeometry args={[0.13, 16, 12]} />
              <meshBasicMaterial
                color={hovered ? '#ffd24f' : '#20e7ff'}
                transparent
                opacity={hovered ? 0.52 : 0.36}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh raycast={() => undefined}>
              <sphereGeometry args={[0.175, 16, 12]} />
              <meshBasicMaterial
                color={hovered ? '#ffc83d' : '#00cde8'}
                transparent
                opacity={hovered ? 0.19 : 0.13}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
              <torusGeometry args={[0.15, 0.012, 8, 40]} />
              <meshBasicMaterial
                color={hovered ? '#fff3a3' : '#24eaff'}
                transparent
                opacity={hovered ? 0.94 : 0.78}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <group ref={orbOrbit} rotation={[0.62, 0, 0.35]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
                <torusGeometry args={[0.195, 0.007, 6, 36]} />
                <meshBasicMaterial
                  color={hovered ? '#ffd24f' : '#ffdc69'}
                  transparent
                  opacity={hovered ? 0.86 : 0.62}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            </group>
            <pointLight
              color={hovered ? '#ffd24f' : '#20e7ff'}
              intensity={hovered ? 4.8 : 2.4}
              distance={hovered ? 3.2 : 2.4}
            />
          </group>
        </group>
      </group>
      <Html position={[0, 3.55, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div
          aria-hidden="true"
          style={{
            color: hovered ? '#fff3a3' : '#9cefff',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 11,
            letterSpacing: '.16em',
            opacity: hovered ? 1 : 0.7,
            textAlign: 'center',
            textShadow: hovered ? '0 0 16px #fff3a3' : '0 0 12px rgba(113,239,255,.65)',
            whiteSpace: 'nowrap',
          }}
        >
          TELESCOPE // {hovered ? 'E / CLICK TO ENTER OBSERVATORY' : 'AIM TO SELECT'}
        </div>
      </Html>
    </group>
  );
}

function FlameField() {
  const { progress } = useReveal();
  const solidMesh = useRef<THREE.InstancedMesh>(null);
  const wireMesh = useRef<THREE.InstancedMesh>(null);
  const solidMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const wireMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const geometry = useGeometry(useMemo(() => new THREE.ConeGeometry(0.18, 1.3, 12, 2), []));
  const positions = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => {
        const side = index % 2 ? -1 : 1;
        const row = Math.floor(index / 2);
        return [side * (1.7 + (row % 3) * 0.28), 0.7, 8.5 + row * 0.57] as const;
      }),
    []
  );

  useEffect(() => {
    const object = new THREE.Object3D();
    positions.forEach((position, index) => {
      object.position.set(...position);
      object.rotation.z = (index % 2 ? 1 : -1) * (0.18 + (index % 5) * 0.025);
      object.scale.setScalar(0.72 + (index % 4) * 0.12);
      object.updateMatrix();
      solidMesh.current?.setMatrixAt(index, object.matrix);
      wireMesh.current?.setMatrixAt(index, object.matrix);
    });
    if (solidMesh.current) solidMesh.current.instanceMatrix.needsUpdate = true;
    if (wireMesh.current) wireMesh.current.instanceMatrix.needsUpdate = true;
  }, [positions]);

  useFrame(() => {
    const local = smoothstep(0.02, 0.19, progress.current);
    if (solidMesh.current) solidMesh.current.visible = local > 0.006;
    if (wireMesh.current) wireMesh.current.visible = local < 0.995;
    if (solidMaterial.current) solidMaterial.current.opacity = local;
    if (wireMaterial.current) wireMaterial.current.opacity = (1 - local) * 0.75;
  });

  return (
    <group>
      <instancedMesh ref={solidMesh} args={[geometry, undefined, positions.length]} castShadow>
        <meshPhysicalMaterial
          ref={solidMaterial}
          color="#eafcff"
          roughness={0.2}
          metalness={0.16}
          clearcoat={1}
          transparent
          opacity={0}
        />
      </instancedMesh>
      <instancedMesh ref={wireMesh} args={[geometry, undefined, positions.length]}>
        <meshBasicMaterial
          ref={wireMaterial}
          color="#71efff"
          wireframe
          transparent
          opacity={0.75}
        />
      </instancedMesh>
    </group>
  );
}

function BridgeAndPools({ mobile }: { mobile: boolean }) {
  return (
    <group>
      {[-6.2, 6.2].map((x) => (
        <mesh key={x} position={[x, 0.02, 15]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[10, 15]} />
          {mobile ? (
            <meshPhysicalMaterial color="#102b3a" roughness={0.15} metalness={0.56} />
          ) : (
            <MeshReflectorMaterial
              color="#0a2234"
              mirror={0.72}
              blur={[280, 90]}
              mixBlur={1.2}
              mixStrength={2.2}
              resolution={512}
              depthScale={0.7}
              minDepthThreshold={0.2}
              maxDepthThreshold={1.6}
            />
          )}
        </mesh>
      ))}
      <BoxPiece size={[2.8, 0.36, 15]} position={[0, 0.26, 15]} phase={0.02} />
      <BoxPiece size={[3.5, 0.24, 3]} position={[0, 0.18, 23.5]} phase={0.01} />
      {[-1.55, 1.55].map((x) => (
        <group key={x}>
          <CylinderPiece args={[0.08, 0.1, 14.6, 8]} position={[x, 1.08, 15]} rotation={[Math.PI / 2, 0, 0]} phase={0.06} />
          {Array.from({ length: 8 }, (_, index) => (
            <group key={index} position={[x, 0, 9 + index * 1.75]}>
              <CylinderPiece
                args={[0.08, 0.11, 1.05, 18]}
                position={[0, 0.7, 0]}
                phase={0.05 + index * 0.004}
              />
              <SpherePiece
                radius={0.13}
                position={[0, 1.28, 0]}
                phase={0.058 + index * 0.004}
              />
              <ConePiece
                args={[0.085, 0.42, 18]}
                position={[0, 1.54, 0]}
                phase={0.062 + index * 0.004}
              />
            </group>
          ))}
        </group>
      ))}
      <FlameField />
    </group>
  );
}

function ReflectionCourt() {
  return (
    <group position={[12, 0, 12]}>
      <CylinderPiece args={[4.6, 4.6, 0.28, 48]} position={[0, 0.15, 0]} phase={0.3} />
      <TorusPiece args={[3.6, 0.12, 8, 72]} position={[0, 0.48, 0]} rotation={[Math.PI / 2, 0, 0]} phase={0.32} />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <ConePiece
            key={index}
            args={[0.28, 2.2, 8]}
            position={[Math.cos(angle) * 3.6, 1.35, Math.sin(angle) * 3.6]}
            phase={0.34}
          />
        );
      })}
      <SpherePiece radius={0.75} position={[0, 1.5, 0]} phase={0.36} />
    </group>
  );
}

function GardenShrine() {
  return (
    <group position={[-12, 0, 12]}>
      <TempleHall position={[0, 0, 0]} size={[5.6, 5.6]} phase={0.27} />
      {Array.from({ length: 7 }, (_, index) => {
        const angle = (index / 7) * Math.PI * 2;
        return (
          <group key={index} position={[Math.cos(angle) * 4.8, 0, Math.sin(angle) * 4.8]}>
            <CylinderPiece args={[0.12, 0.18, 1.7, 7]} position={[0, 0.85, 0]} phase={0.24} />
            <SpherePiece radius={0.55} position={[0, 1.95, 0]} phase={0.26} color="#d7f5ec" />
          </group>
        );
      })}
    </group>
  );
}

function Grounds() {
  return (
    <group>
      <BoxPiece size={[45, 0.35, 51]} position={[0, -0.2, 1]} phase={0} color="#d9edf0" castShadow={false} />
      <BoxPiece size={[5, 0.12, 48]} position={[0, 0.04, 0]} phase={0.01} color="#dceff1" castShadow={false} />
      <BoxPiece size={[31, 0.1, 3.2]} position={[0, 0.05, -1]} phase={0.24} color="#dceff1" castShadow={false} />
      <BoxPiece size={[31, 0.1, 3.2]} position={[0, 0.05, -14]} phase={0.55} color="#dceff1" castShadow={false} />
      <BoxPiece size={[3.2, 0.1, 16]} position={[-13, 0.05, -7.5]} phase={0.45} color="#dceff1" castShadow={false} />
      <BoxPiece size={[3.2, 0.1, 16]} position={[13, 0.05, -7.5]} phase={0.45} color="#dceff1" castShadow={false} />
    </group>
  );
}

function ZoneLabel({ zone, count = 0 }: { zone: TempleZone; count?: number }) {
  return (
    <Html
      position={[zone.position[0], 7.4, zone.position[2]]}
      center
      distanceFactor={17}
      style={{ pointerEvents: 'none' }}
    >
      <div
        aria-hidden="true"
        style={{
          minWidth: 150,
          color: zone.clusterId ? '#d9fbff' : '#68828d',
          fontFamily: 'var(--font-pixel), monospace',
          fontSize: 14,
          letterSpacing: '.17em',
          textAlign: 'center',
          textShadow: zone.clusterId ? '0 0 16px rgba(113,239,255,.72)' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: zone.clusterId ? '#71efff' : '#536771' }}>{zone.sigil}</span>{' '}
        {zone.shortName}
        {zone.clusterId && (
          <small
            style={{
              display: 'block',
              marginTop: 5,
              color: '#68838d',
              fontSize: 7,
              letterSpacing: '.12em',
            }}
          >
            {count.toLocaleString()} TWEET ARTIFACTS
          </small>
        )}
      </div>
    </Html>
  );
}

type ArtifactLayout = {
  memory: TempleTweetMemory;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  variant: 0 | 1 | 2;
};

function seededUnit(seed: number, salt: number) {
  let value = seed ^ Math.imul(salt + 1, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function artifactColor(base: string, memory: TempleTweetMemory) {
  const color = new THREE.Color(base);
  const year = memory.publishedAt ? new Date(memory.publishedAt).getUTCFullYear() : 2023;
  color.offsetHSL(
    (year - 2023) * 0.012 + (seededUnit(memory.visualSeed, 8) - 0.5) * 0.035,
    memory.tweetType === 'reply' ? -0.08 : 0.04,
    (seededUnit(memory.visualSeed, 9) - 0.5) * 0.14
  );
  return `#${color.getHexString()}`;
}

function buildArtifactLayouts(
  zone: TempleZone,
  cluster: TempleCluster,
  memories: TempleTweetMemory[]
): ArtifactLayout[] {
  const total = Math.max(1, memories.length);
  return memories.map((memory, index) => {
    const seed = memory.visualSeed;
    const jitterX = seededUnit(seed, 1) - 0.5;
    const jitterY = seededUnit(seed, 2) - 0.5;
    const jitterZ = seededUnit(seed, 3) - 0.5;
    const length = THREE.MathUtils.clamp(memory.text.length / 240, 0.12, 1);
    const replyScale = memory.tweetType === 'reply' ? 0.78 : 1;
    const variant = (seed % 3) as 0 | 1 | 2;
    let position: [number, number, number];
    let rotation: [number, number, number];
    let scale: [number, number, number];

    switch (cluster.installation) {
      case 'transmission-canopy': {
        const columns = 9;
        const row = Math.floor(index / columns);
        const rows = Math.ceil(total / columns);
        const along = rows <= 1 ? 0.5 : row / (rows - 1);
        position = [
          zone.position[0] + (index % columns - (columns - 1) / 2) * 0.28 + jitterX * 0.07,
          2.55 + (index % 3) * 0.52 + jitterY * 0.16,
          zone.position[2] - 5.4 + along * 10.8 + jitterZ * 0.12,
        ];
        rotation = [jitterX * 0.5, seededUnit(seed, 4) * Math.PI * 2, jitterZ * 0.4];
        scale = [0.11 + length * 0.08, (0.2 + length * 0.2) * replyScale, 0.11 + variant * 0.025];
        break;
      }
      case 'commons-game-table': {
        const angle = index * 2.399963 + jitterX * 0.25;
        const radius = 0.85 + Math.sqrt((index + 1) / total) * 3.35;
        position = [
          zone.position[0] + Math.cos(angle) * radius,
          3.25 + (index % 4) * 0.24 + jitterY * 0.09,
          zone.position[2] + Math.sin(angle) * radius,
        ];
        rotation = [jitterZ * 0.12, -angle + Math.PI / 2, jitterX * 0.15];
        scale = [(0.16 + length * 0.1) * replyScale, 0.13 + variant * 0.055, 0.16 + length * 0.08];
        break;
      }
      case 'spaghetti-tapestry': {
        const columns = 18;
        const row = Math.floor(index / columns);
        const rows = Math.ceil(total / columns);
        position = [
          zone.position[0] - 3.15 + (index % columns) / (columns - 1) * 6.3,
          0.95 + (rows <= 1 ? 0.5 : row / (rows - 1)) * 3.35 + jitterY * 0.08,
          zone.position[2] - 2.64 + jitterZ * 0.035,
        ];
        rotation = [jitterX * 0.2, jitterY * 0.2, seededUnit(seed, 5) * Math.PI * 2];
        scale = [(0.2 + length * 0.12) * replyScale, 0.16 + variant * 0.05, 0.13 + length * 0.04];
        break;
      }
      case 'library-of-prompts': {
        const columns = 28;
        const row = Math.floor(index / columns);
        position = [
          zone.position[0] - 3.2 + (index % columns) / (columns - 1) * 6.4,
          0.83 + row * 0.7,
          zone.position[2] - 2.65 + jitterZ * 0.025,
        ];
        rotation = [0, jitterZ * 0.1, jitterX * 0.12];
        scale = [(0.075 + seededUnit(seed, 6) * 0.055) * replyScale, 0.34 + length * 0.28, 0.13 + variant * 0.025];
        break;
      }
      case 'machine-muses': {
        const columns = 12;
        const row = Math.floor(index / columns);
        const rows = Math.ceil(total / columns);
        position = [
          zone.position[0] - 2.75 + (index % columns) / (columns - 1) * 5.5,
          0.85 + (rows <= 1 ? 0.5 : row / (rows - 1)) * 3.55,
          zone.position[2] - 2.64 + jitterZ * 0.05,
        ];
        rotation = [jitterX * 0.35, jitterY * 0.35, seededUnit(seed, 7) * Math.PI * 2];
        scale = [(0.16 + length * 0.12) * replyScale, 0.18 + variant * 0.055, 0.12 + length * 0.08];
        break;
      }
      case 'commitment-chandelier': {
        const angle = index * 2.399963 + jitterX * 0.2;
        const radius = 0.45 + Math.sqrt((index + 1) / total) * 3.15;
        position = [
          zone.position[0] + Math.cos(angle) * radius,
          4.25 - radius * 0.52 + jitterY * 0.3,
          zone.position[2] + Math.sin(angle) * radius,
        ];
        rotation = [0, seededUnit(seed, 4) * Math.PI * 2, jitterZ * 0.3];
        scale = [(0.11 + length * 0.08) * replyScale, 0.23 + length * 0.32, 0.11 + variant * 0.025];
        break;
      }
      case 'attention-carillon': {
        const angle = index * 2.399963 + jitterX * 0.24;
        const radius = 0.65 + Math.sqrt((index + 1) / total) * 3.75;
        position = [
          zone.position[0] + Math.cos(angle) * radius,
          1.05 + (index % 11) * 0.31 + jitterY * 0.14,
          zone.position[2] + Math.sin(angle) * radius * 0.8,
        ];
        rotation = [jitterZ * 0.2, -angle, jitterX * 0.26];
        scale = [(0.12 + length * 0.09) * replyScale, 0.2 + variant * 0.06, 0.12 + seededUnit(seed, 5) * 0.07];
        break;
      }
      case 'human-mirror':
      default: {
        const angle = index * 2.399963 + jitterX * 0.2;
        const radius = 0.55 + Math.sqrt((index + 1) / total) * 4.05;
        position = [
          zone.position[0] + Math.cos(angle) * radius,
          1.25 + (index % 9) * 0.37 + jitterY * 0.18,
          zone.position[2] + Math.sin(angle) * radius * 0.82,
        ];
        rotation = [seededUnit(seed, 4) * Math.PI, -angle, seededUnit(seed, 5) * Math.PI];
        scale = [(0.13 + length * 0.1) * replyScale, 0.18 + variant * 0.05, 0.055 + seededUnit(seed, 6) * 0.04];
        break;
      }
    }
    return {
      memory,
      position,
      rotation,
      scale,
      color: artifactColor(cluster.color, memory),
      variant,
    };
  });
}

function installationGeometries(kind: TempleInstallationKind, mobile: boolean) {
  const detail = mobile ? 0 : 1;
  switch (kind) {
    case 'transmission-canopy':
      return [
        new THREE.OctahedronGeometry(1, detail),
        new THREE.CapsuleGeometry(0.55, 0.9, mobile ? 2 : 4, mobile ? 6 : 10),
        new THREE.IcosahedronGeometry(0.82, detail),
      ];
    case 'commons-game-table':
      return [
        new RoundedBoxGeometry(1.15, 0.24, 1.62, mobile ? 1 : 2, 0.12),
        new THREE.CylinderGeometry(0.42, 0.68, 1.15, mobile ? 5 : 8),
        new THREE.IcosahedronGeometry(0.72, detail),
      ];
    case 'spaghetti-tapestry':
      return [
        new THREE.TorusKnotGeometry(0.58, 0.16, mobile ? 28 : 48, mobile ? 5 : 8, 2, 3),
        new THREE.TorusGeometry(0.62, 0.16, mobile ? 5 : 8, mobile ? 18 : 32),
        new THREE.CapsuleGeometry(0.22, 1.15, mobile ? 2 : 4, mobile ? 5 : 8),
      ];
    case 'library-of-prompts':
      return [
        new THREE.BoxGeometry(1, 1, 1),
        new RoundedBoxGeometry(1, 1, 1, mobile ? 1 : 2, 0.12),
        new THREE.CylinderGeometry(0.5, 0.5, 1, mobile ? 6 : 10),
      ];
    case 'machine-muses':
      return [
        new THREE.DodecahedronGeometry(0.85, detail),
        new THREE.TetrahedronGeometry(0.95, detail),
        new THREE.TorusKnotGeometry(0.5, 0.16, mobile ? 24 : 40, mobile ? 5 : 8),
      ];
    case 'commitment-chandelier':
      return [
        new THREE.OctahedronGeometry(0.9, detail),
        new THREE.ConeGeometry(0.68, 1.5, mobile ? 6 : 10),
        new THREE.IcosahedronGeometry(0.8, detail),
      ];
    case 'attention-carillon':
      return [
        new THREE.ConeGeometry(0.72, 1.2, mobile ? 6 : 10, 1, true),
        new THREE.TorusGeometry(0.62, 0.16, mobile ? 6 : 9, mobile ? 18 : 32),
        new THREE.CapsuleGeometry(0.3, 0.72, mobile ? 2 : 4, mobile ? 6 : 10),
      ];
    case 'human-mirror':
    default:
      return [
        new THREE.TetrahedronGeometry(0.9, detail),
        new THREE.OctahedronGeometry(0.82, detail),
        new THREE.CircleGeometry(0.82, mobile ? 8 : 16),
      ];
  }
}

function InstancedArtifactVariant({
  artifacts,
  geometry,
  color,
  mode,
  phase,
}: {
  artifacts: ArtifactLayout[];
  geometry: THREE.BufferGeometry;
  color: string;
  mode: TempleMaterialMode;
  phase: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshPhysicalMaterial>(null);
  const { progress } = useReveal();

  useEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    artifacts.forEach((artifact, index) => {
      object.position.set(...artifact.position);
      object.rotation.set(...artifact.rotation);
      object.scale.set(...artifact.scale);
      object.updateMatrix();
      mesh.current?.setMatrixAt(index, object.matrix);
      mesh.current?.setColorAt(index, new THREE.Color(artifact.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [artifacts]);

  useFrame(() => {
    if (!material.current) return;
    const local = smoothstep(phase, Math.min(1, phase + 0.18), progress.current);
    material.current.opacity = mode === 'wireframe' ? 0.62 : local;
    if (mesh.current) mesh.current.visible = mode === 'wireframe' || local > 0.006;
  });

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, artifacts.length]} castShadow={false} receiveShadow={false}>
      <meshPhysicalMaterial
        ref={material}
        color="#ffffff"
        emissive={color}
        emissiveIntensity={mode === 'wireframe' ? 0.86 : 0.48}
        roughness={mode === 'wireframe' ? 0.48 : 0.2}
        metalness={0.58}
        clearcoat={1}
        vertexColors
        wireframe={mode === 'wireframe'}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

function ArtifactAccentMesh({
  artifacts,
  color,
  phase,
  mode,
}: {
  artifacts: ArtifactLayout[];
  color: string;
  phase: number;
  mode: TempleMaterialMode;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const { progress } = useReveal();
  const geometry = useGeometry(useMemo(() => new THREE.TorusGeometry(0.82, 0.08, 6, 18), []));

  useEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    artifacts.forEach((artifact, index) => {
      object.position.set(...artifact.position);
      object.rotation.set(artifact.rotation[0] + Math.PI / 2, artifact.rotation[1], artifact.rotation[2]);
      const size = Math.max(...artifact.scale) * 1.25;
      object.scale.setScalar(size);
      object.updateMatrix();
      mesh.current?.setMatrixAt(index, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [artifacts]);

  useFrame(() => {
    if (!material.current) return;
    const local = smoothstep(phase + 0.04, Math.min(1, phase + 0.22), progress.current);
    material.current.opacity = (mode === 'wireframe' ? 0.38 : local * 0.72);
    if (mesh.current) mesh.current.visible = mode === 'wireframe' || local > 0.006;
  });

  if (artifacts.length === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, artifacts.length]}>
      <meshBasicMaterial ref={material} color={color} transparent opacity={0} toneMapped={false} />
    </instancedMesh>
  );
}

function InstallationScaffold({
  zone,
  cluster,
  mode,
}: {
  zone: TempleZone;
  cluster: TempleCluster;
  mode: TempleMaterialMode;
}) {
  const color = mode === 'wireframe' ? '#71efff' : cluster.color;
  const material = (
    <meshPhysicalMaterial
      color={mode === 'wireframe' ? '#153944' : '#dce9e8'}
      emissive={color}
      emissiveIntensity={mode === 'wireframe' ? 0.78 : 0.18}
      metalness={0.7}
      roughness={0.28}
      transparent
      opacity={0.72}
      wireframe={mode === 'wireframe'}
    />
  );

  switch (cluster.installation) {
    case 'transmission-canopy':
      return (
        <group position={zone.position}>
          {[-1.12, -0.56, 0, 0.56, 1.12].map((x) => (
            <mesh key={x} position={[x, 3.75 + Math.abs(x) * 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 12, 6]} />
              {material}
            </mesh>
          ))}
          <mesh position={[0, 3.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.45, 0.035, 8, 48]} />
            {material}
          </mesh>
        </group>
      );
    case 'commons-game-table':
      return (
        <group position={zone.position}>
          <mesh position={[0, 3.98, 0]}>
            <cylinderGeometry args={[4.35, 4.35, 0.18, 64]} />
            {material}
          </mesh>
          {[1.1, 2.2, 3.35, 4.12].map((radius, index) => (
            <mesh key={radius} position={[0, 4.09 + index * 0.018, 0]} rotation={[Math.PI / 2, index * 0.22, 0]}>
              <torusGeometry args={[radius, 0.035, 6, 48]} />
              {material}
            </mesh>
          ))}
          {Array.from({ length: 8 }, (_, index) => {
            const angle = index / 8 * Math.PI * 2;
            return (
              <mesh
                key={index}
                position={[Math.cos(angle) * 3.15, 4.13, Math.sin(angle) * 3.15]}
                rotation={[0, -angle, 0]}
              >
                <boxGeometry args={[0.035, 0.035, 5.9]} />
                {material}
              </mesh>
            );
          })}
          <mesh position={[0, 4.48, 0]} rotation={[0, Math.PI / 4, 0]}>
            <icosahedronGeometry args={[0.42, 0]} />
            {material}
          </mesh>
        </group>
      );
    case 'spaghetti-tapestry':
      return (
        <group position={[zone.position[0], 2.65, zone.position[2] - 2.74]}>
          <mesh scale={[1.45, 1.45, 0.55]}>
            <torusKnotGeometry args={[1.24, 0.08, 96, 8, 2, 5]} />
            {material}
          </mesh>
          <mesh scale={[2.9, 1.75, 1]}>
            <planeGeometry args={[2.2, 2.2]} />
            <meshBasicMaterial color={color} transparent opacity={0.045} side={THREE.DoubleSide} />
          </mesh>
        </group>
      );
    case 'library-of-prompts':
      return (
        <group position={[zone.position[0], 0, zone.position[2] - 2.76]}>
          {Array.from({ length: 7 }, (_, index) => (
            <mesh key={index} position={[0, 0.67 + index * 0.7, 0]}>
              <boxGeometry args={[6.9, 0.055, 0.32]} />
              {material}
            </mesh>
          ))}
          {[-3.4, 0, 3.4].map((x) => (
            <mesh key={x} position={[x, 2.75, 0]}>
              <boxGeometry args={[0.06, 4.25, 0.3]} />
              {material}
            </mesh>
          ))}
        </group>
      );
    case 'machine-muses':
      return (
        <group position={[zone.position[0], 2.7, zone.position[2] - 2.76]}>
          {[0.9, 1.75, 2.62].map((radius, index) => (
            <mesh key={radius} rotation={[0, 0, index * 0.32]}>
              <torusGeometry args={[radius, 0.045, 6, 44]} />
              {material}
            </mesh>
          ))}
          <mesh>
            <icosahedronGeometry args={[0.48, 1]} />
            {material}
          </mesh>
        </group>
      );
    case 'commitment-chandelier':
      return (
        <group position={zone.position}>
          {[0.8, 1.65, 2.65, 3.55].map((radius, index) => (
            <mesh key={radius} position={[0, 4.55 - index * 0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[radius, 0.055, 7, 56]} />
              {material}
            </mesh>
          ))}
          <mesh position={[0, 4.75, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
            {material}
          </mesh>
        </group>
      );
    case 'attention-carillon':
      return (
        <group position={zone.position}>
          {[1.1, 2.1, 3.15, 4.15].map((radius, index) => (
            <mesh key={radius} position={[0, 4.65 - index * 0.74, 0]} rotation={[Math.PI / 2, index * 0.28, 0]}>
              <torusGeometry args={[radius, 0.035, 6, 56]} />
              {material}
            </mesh>
          ))}
          <mesh position={[0, 3.15, 0]}>
            <cylinderGeometry args={[0.045, 0.075, 5.8, 8]} />
            {material}
          </mesh>
          <mesh position={[0, 5.25, 0]}>
            <octahedronGeometry args={[0.36, 0]} />
            {material}
          </mesh>
        </group>
      );
    case 'human-mirror':
    default:
      return (
        <group position={zone.position}>
          {[1.1, 2.2, 3.35, 4.35].map((radius, index) => (
            <mesh key={radius} position={[0, 4.4 - index * 0.31, 0]} rotation={[Math.PI / 2, index * 0.12, 0]}>
              <torusGeometry args={[radius, 0.028, 6, 56]} />
              {material}
            </mesh>
          ))}
          <mesh position={[0, 4.9, 0]}>
            <octahedronGeometry args={[0.34, 0]} />
            {material}
          </mesh>
        </group>
      );
  }
}

function RevealedInstallationScaffold({
  zone,
  cluster,
  mode,
}: {
  zone: TempleZone;
  cluster: TempleCluster;
  mode: TempleMaterialMode;
}) {
  const group = useRef<THREE.Group>(null);
  const { progress } = useReveal();
  useFrame(() => {
    if (!group.current) return;
    group.current.visible = mode === 'wireframe' || progress.current > zone.revealPhase + 0.02;
  });
  return (
    <group ref={group}>
      <InstallationScaffold zone={zone} cluster={cluster} mode={mode} />
    </group>
  );
}

function ArtifactInstallation({
  zone,
  cluster,
  memories,
  active,
  mobile,
  mode,
  focused,
  onFocus,
}: {
  zone: TempleZone;
  cluster: TempleCluster;
  memories: TempleTweetMemory[];
  active: boolean;
  mobile: boolean;
  mode: TempleMaterialMode;
  focused: TempleFocus;
  onFocus: (focus: TempleFocus) => void;
}) {
  const hitMesh = useRef<THREE.InstancedMesh>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const raycastElapsed = useRef(0);
  const lastAimed = useRef<string | null>(null);
  const { camera, gl } = useThree();
  const layouts = useMemo(
    () => buildArtifactLayouts(zone, cluster, memories),
    [cluster, memories, zone]
  );
  const geometries = useMemo(
    () => installationGeometries(cluster.installation, mobile),
    [cluster.installation, mobile]
  );
  const hitGeometry = useGeometry(useMemo(() => new THREE.SphereGeometry(1, 7, 5), []));
  const byVariant = useMemo(
    () => [0, 1, 2].map((variant) => layouts.filter((artifact) => artifact.variant === variant)),
    [layouts]
  );
  const mediaArtifacts = useMemo(
    () => layouts.filter((artifact) =>
      artifact.memory.attachmentUrls.length > 0 || artifact.memory.attachmentAltText.length > 0
    ),
    [layouts]
  );
  const memberIds = useMemo(() => new Set(memories.map((memory) => memory.id)), [memories]);
  const focusedLayout = focused?.kind === 'memory'
    ? layouts.find((artifact) => artifact.memory.id === focused.id) ?? null
    : null;

  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  useEffect(() => {
    if (!hitMesh.current) return;
    const object = new THREE.Object3D();
    layouts.forEach((artifact, index) => {
      object.position.set(...artifact.position);
      object.rotation.set(0, 0, 0);
      const hitSize = Math.max(...artifact.scale) * 1.45 + 0.08;
      object.scale.setScalar(hitSize);
      object.updateMatrix();
      hitMesh.current?.setMatrixAt(index, object.matrix);
    });
    hitMesh.current.instanceMatrix.needsUpdate = true;
    hitMesh.current.computeBoundingSphere();
  }, [layouts]);

  useEffect(() => {
    if (active) return;
    lastAimed.current = null;
    if (focused?.kind === 'memory' && memberIds.has(focused.id)) onFocus(null);
  }, [active, focused, memberIds, onFocus]);

  useFrame((_, delta) => {
    if (!active || !hitMesh.current) return;
    const crosshairAiming = mobile || document.pointerLockElement === gl.domElement;
    if (!crosshairAiming) return;
    raycastElapsed.current += delta;
    if (raycastElapsed.current < 1 / 15) return;
    raycastElapsed.current = 0;
    raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersection = raycaster.current.intersectObject(hitMesh.current, false)[0];
    const memoryId = intersection?.instanceId === undefined
      ? null
      : layouts[intersection.instanceId]?.memory.id ?? null;
    if (memoryId === lastAimed.current) return;
    lastAimed.current = memoryId;
    onFocus(memoryId ? { kind: 'memory', id: memoryId } : null);
  });

  const focusInstance = (event: ThreeEvent<PointerEvent>) => {
    if (!active || event.instanceId === undefined) return;
    event.stopPropagation();
    const memory = layouts[event.instanceId]?.memory;
    if (memory) onFocus({ kind: 'memory', id: memory.id });
  };

  return (
    <group>
      <RevealedInstallationScaffold zone={zone} cluster={cluster} mode={mode} />
      {byVariant.map((artifacts, variant) => (
        <InstancedArtifactVariant
          key={variant}
          artifacts={artifacts}
          geometry={geometries[variant]}
          color={cluster.color}
          mode={mode}
          phase={zone.revealPhase}
        />
      ))}
      <ArtifactAccentMesh
        artifacts={mediaArtifacts}
        color="#fff0a6"
        phase={zone.revealPhase}
        mode={mode}
      />
      <instancedMesh
        ref={hitMesh}
        args={[hitGeometry, undefined, layouts.length]}
        onPointerMove={focusInstance}
        onPointerOut={() => {
          if (!mobile && document.pointerLockElement !== gl.domElement) onFocus(null);
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>
      {focusedLayout && (
        <group position={focusedLayout.position}>
          <mesh scale={Math.max(...focusedLayout.scale) * 1.14}>
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.4} toneMapped={false} />
          </mesh>
          <pointLight color={cluster.color} intensity={1.4} distance={2.8} />
        </group>
      )}
    </group>
  );
}

function Exhibits({
  dataset,
  activeZoneId,
  mobile,
  mode,
  focused,
  onFocus,
}: Pick<
  TempleSceneProps,
  'dataset' | 'activeZoneId' | 'mobile' | 'mode' | 'focused' | 'onFocus'
>) {
  const clusters = useMemo(
    () => new Map(dataset.clusters.map((cluster) => [cluster.id, cluster])),
    [dataset.clusters]
  );
  const memories = useMemo(
    () => new Map(dataset.memories.map((memory) => [memory.id, memory])),
    [dataset.memories]
  );

  return (
    <>
      {dataset.temple.zones.map((zone) => {
        if (!zone.clusterId) return <ZoneLabel key={zone.id} zone={zone} />;
        const cluster = clusters.get(zone.clusterId);
        if (!cluster) return null;
        const zoneMemories = cluster.memoryIds
          .map((id) => memories.get(id))
          .filter((memory): memory is TempleTweetMemory => Boolean(memory));
        return (
          <group key={zone.id}>
            <ZoneLabel zone={zone} count={zoneMemories.length} />
            <ArtifactInstallation
              zone={zone}
              cluster={cluster}
              memories={zoneMemories}
              active={activeZoneId === zone.id}
              mobile={mobile}
              mode={mode}
              focused={focused}
              onFocus={onFocus}
            />
          </group>
        );
      })}
    </>
  );
}

const LETTER_SELECT_DISTANCE = 12;
const LETTER_HIT_RADIUS = 1.18;

function LetterCollectible({
  zone,
  letter,
  active,
  collected,
  focused,
  mobile,
  onFocus,
}: {
  zone: TempleZone;
  letter: string;
  active: boolean;
  collected: boolean;
  focused: boolean;
  mobile: boolean;
  onFocus: (focus: TempleFocus) => void;
}) {
  const visual = useRef<THREE.Group>(null);
  const hitArea = useRef<THREE.Mesh>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const raycastElapsed = useRef(0);
  const worldPosition = useRef(new THREE.Vector3());
  const { camera, gl } = useThree();
  const position = useMemo<[number, number, number]>(() => {
    if (zone.id === 'central-ubosot') return [-3.1, 1.55, -1.8];
    const dx = zone.spawn[0] - zone.position[0];
    const dz = zone.spawn[2] - zone.position[2];
    const length = Math.hypot(dx, dz) || 1;
    const offset = 1.15;
    return [
      zone.spawn[0] - dz / length * offset,
      1.55,
      zone.spawn[2] + dx / length * offset,
    ];
  }, [zone]);

  useEffect(() => {
    if (collected && focused) onFocus(null);
  }, [collected, focused, onFocus]);

  useFrame((state, delta) => {
    if (visual.current) {
      visual.current.position.y = Math.sin(state.clock.elapsedTime * 1.8 + zone.revealPhase * 9) * 0.12;
      visual.current.rotation.y += delta * 0.55;
    }
    if (collected || !hitArea.current) return;
    const crosshairAiming = mobile || document.pointerLockElement === gl.domElement;
    if (!crosshairAiming) return;
    raycastElapsed.current += delta;
    if (raycastElapsed.current < 1 / 20) return;
    raycastElapsed.current = 0;
    hitArea.current.getWorldPosition(worldPosition.current);
    const withinSelectionRange = camera.position.distanceTo(worldPosition.current) <= LETTER_SELECT_DISTANCE;
    if (!withinSelectionRange) {
      if (focused) onFocus(null);
      return;
    }
    raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
    const aimedAtLetter = raycaster.current.intersectObject(hitArea.current, false).length > 0;
    if (aimedAtLetter && !focused) onFocus({ kind: 'letter', id: zone.id });
    if (!aimedAtLetter && focused) onFocus(null);
  });

  if (collected) return null;

  return (
    <group position={position}>
      <group ref={visual}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.46, 0.045, 8, 40]} />
          <meshBasicMaterial
            color={focused ? '#fff0a6' : '#71efff'}
            transparent
            opacity={focused ? 1 : 0.72}
            toneMapped={false}
          />
        </mesh>
        <mesh>
          <octahedronGeometry args={[0.3, 1]} />
          <meshPhysicalMaterial
            color="#dffaff"
            emissive={focused ? '#fff0a6' : '#39bdd2'}
            emissiveIntensity={focused ? 2.4 : 1.25}
            metalness={0.45}
            roughness={0.16}
            transparent
            opacity={0.82}
          />
        </mesh>
        <mesh
          ref={hitArea}
          onPointerMove={(event) => {
            if (
              mobile
              || document.pointerLockElement === gl.domElement
              || event.distance > LETTER_SELECT_DISTANCE
            ) return;
            event.stopPropagation();
            onFocus({ kind: 'letter', id: zone.id });
          }}
          onPointerOut={() => {
            if (!mobile && document.pointerLockElement !== gl.domElement && focused) onFocus(null);
          }}
        >
          <sphereGeometry args={[LETTER_HIT_RADIUS, 14, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        {focused && (
          <group>
            <mesh raycast={() => undefined}>
              <icosahedronGeometry args={[0.88, 2]} />
              <meshBasicMaterial
                color="#e9fdff"
                wireframe
                transparent
                opacity={0.56}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
              <torusGeometry args={[0.96, 0.018, 8, 54]} />
              <meshBasicMaterial
                color="#fff0a6"
                transparent
                opacity={0.72}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        )}
        <Html position={[0, 0.02, 0]} center distanceFactor={7} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              color: focused ? '#fff0a6' : '#e8fcff',
              fontFamily: 'var(--font-pixel), monospace',
              fontSize: 26,
              lineHeight: 1,
              textShadow: focused ? '0 0 16px #fff0a6' : '0 0 12px #71efff',
            }}
          >
            {letter}
          </div>
        </Html>
        <Sparkles
          count={12}
          scale={[1.4, 1.4, 1.4]}
          size={1.4}
          speed={0.35}
          color={focused ? '#fff0a6' : '#71efff'}
          opacity={focused ? 0.92 : 0.5}
        />
        <pointLight
          color={focused ? '#fff0a6' : '#71efff'}
          intensity={focused ? 4.5 : 2.2}
          distance={5}
        />
        {active && (
          <Html position={[0, 0.86, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                color: focused ? '#fff0a6' : '#86c8d2',
                fontFamily: 'var(--font-pixel), monospace',
                fontSize: 9,
                letterSpacing: '.16em',
                textAlign: 'center',
                textShadow: focused ? '0 0 14px #fff0a6' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              LOST LETTER // PICK UP
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

function TempleLetters({
  zones,
  assignments,
  collectedZoneIds,
  activeZoneId,
  focused,
  mobile,
  onFocus,
}: {
  zones: TempleZone[];
  assignments: TempleLetter[];
  collectedZoneIds: Set<string>;
  activeZoneId: string | null;
  focused: TempleFocus;
  mobile: boolean;
  onFocus: (focus: TempleFocus) => void;
}) {
  const zonesById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones]);
  return assignments.map((assignment) => {
    const zone = zonesById.get(assignment.zoneId);
    if (!zone) return null;
    return (
      <LetterCollectible
        key={assignment.zoneId}
        zone={zone}
        letter={assignment.letter}
        active={activeZoneId === zone.id}
        collected={collectedZoneIds.has(zone.id)}
        focused={focused?.kind === 'letter' && focused.id === zone.id}
        mobile={mobile}
        onFocus={onFocus}
      />
    );
  });
}

function SanctumDoor({
  unlocked,
  collectedLetterCount,
  requiredCount,
}: {
  unlocked: boolean;
  collectedLetterCount: number;
  requiredCount: number;
}) {
  const door = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!door.current) return;
    door.current.position.y = THREE.MathUtils.damp(
      door.current.position.y,
      unlocked ? 3.4 : 0,
      4,
      delta
    );
  });

  return (
    <group position={[0, 0, -2.6]}>
      <group ref={door}>
        <BoxPiece
          size={[2.5, 3.7, 0.24]}
          position={[0, 2.15, 0]}
          phase={0.58}
          gold={unlocked}
        />
      </group>
      <mesh
        position={[0, 2.1, 0.22]}
      >
        <planeGeometry args={[3.2, 4.2]} />
        <meshBasicMaterial color="#fff3a3" transparent opacity={unlocked ? 0.08 : 0} />
      </mesh>
      {unlocked && (
        <>
          <TorusPiece
            args={[1.15, 0.055, 8, 64]}
            position={[0, 2.1, 0.28]}
            phase={0.58}
            gold
          />
          <pointLight color="#fff3a3" intensity={5} distance={10} position={[0, 2, 1]} />
        </>
      )}
      <Html position={[0, 4.8, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            color: unlocked ? '#fff3a3' : '#65808a',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 15,
            letterSpacing: '.18em',
            textAlign: 'center',
            textShadow: unlocked ? '0 0 18px #fff3a3' : 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {unlocked
            ? 'SANCTUM OPEN // ENTER'
            : collectedLetterCount >= requiredCount
              ? 'SANCTUM LOCK // SPELL THE KEY'
              : `SANCTUM LOCK // ${String(collectedLetterCount).padStart(2, '0')} / ${String(requiredCount).padStart(2, '0')} LETTERS`}
        </div>
      </Html>
    </group>
  );
}

function BirthdayCakeAltar({
  focused,
  mobile,
  onFocus,
  onBlur,
}: {
  focused: boolean;
  mobile: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const altar = useRef<THREE.Group>(null);
  const hitArea = useRef<THREE.Mesh>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const raycastElapsed = useRef(0);
  const { camera, gl } = useThree();

  useFrame((state, delta) => {
    if (altar.current) {
      altar.current.position.y = Math.sin(state.clock.elapsedTime * 1.15) * 0.07;
      altar.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.035;
    }

    if (!hitArea.current) return;
    const crosshairAiming = mobile || document.pointerLockElement === gl.domElement;
    if (!crosshairAiming) return;
    raycastElapsed.current += delta;
    if (raycastElapsed.current < 1 / 20) return;
    raycastElapsed.current = 0;
    raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
    const aimedAtCake = raycaster.current.intersectObject(hitArea.current, false).length > 0;
    if (aimedAtCake && !focused) onFocus();
    if (!aimedAtCake && focused) onBlur();
  });

  const candles = [-0.24, 0, 0.24];

  return (
    <group position={[0, 0, -6.25]}>
      <group ref={altar}>
        <AngelWing side={-1} />
        <AngelWing side={1} />

        <CylinderPiece
          args={[1.18, 0.98, 0.18, 40]}
          position={[0, 1.02, 0]}
          phase={0.61}
          gold
        />
        <TorusPiece
          args={[1.08, 0.055, 12, 80]}
          position={[0, 1.12, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          phase={0.63}
          gold
        />
        <HeartPiece
          position={[0, 0.9, 1.02]}
          scale={[0.38, 0.38, 0.38]}
          phase={0.68}
          color="#f39ac4"
          wireColor="#ffb8da"
          gold
          castShadow={false}
        />
        <HeartPiece
          position={[-1.32, 2.1, 0.02]}
          rotation={[0, -0.18, -0.18]}
          scale={[0.22, 0.22, 0.22]}
          phase={0.76}
          color="#ffafd2"
          wireColor="#ffd2e7"
          castShadow={false}
        />
        <HeartPiece
          position={[1.32, 2.1, 0.02]}
          rotation={[0, 0.18, 0.18]}
          scale={[0.22, 0.22, 0.22]}
          phase={0.77}
          color="#ffafd2"
          wireColor="#ffd2e7"
          castShadow={false}
        />
        <AltarFlower position={[-0.88, 1.08, 0.64]} color="#f4b6d0" phase={0.67} scale={0.78} />
        <AltarFlower position={[-0.48, 1.11, 0.94]} color="#eefaff" phase={0.69} scale={0.88} />
        <AltarFlower position={[0.48, 1.11, 0.94]} color="#eefaff" phase={0.7} scale={0.88} />
        <AltarFlower position={[0.88, 1.08, 0.64]} color="#f4b6d0" phase={0.68} scale={0.78} />
        <ConePiece
          args={[0.48, 0.62, 32]}
          position={[0, 0.67, 0]}
          rotation={[Math.PI, 0, 0]}
          phase={0.6}
          gold
        />
        <SpherePiece radius={0.16} position={[0, 0.3, 0]} phase={0.59} gold />

        <CylinderPiece
          args={[0.68, 0.72, 0.42, 40]}
          position={[0, 1.33, 0]}
          phase={0.68}
          color="#f0a8c8"
          wireColor="#ff9bd2"
        />
        <TorusPiece
          args={[0.69, 0.045, 12, 80]}
          position={[0, 1.53, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          phase={0.7}
          color="#fff6df"
          wireColor="#fff0a6"
        />
        <CylinderPiece
          args={[0.46, 0.5, 0.3, 36]}
          position={[0, 1.67, 0]}
          phase={0.71}
          color="#fff4de"
          wireColor="#fff0a6"
        />
        <TorusPiece
          args={[0.47, 0.04, 12, 72]}
          position={[0, 1.82, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          phase={0.73}
          color="#f0a8c8"
          wireColor="#ff9bd2"
        />

        {candles.map((x, index) => (
          <group key={x} position={[x, 0, index === 1 ? -0.06 : 0.04]}>
            <CylinderPiece
              args={[0.035, 0.035, 0.27, 18]}
              position={[0, 2.02, 0]}
              phase={0.76 + index * 0.012}
              color={index === 1 ? '#71efff' : '#ffb7d8'}
              wireColor="#fff7cb"
              castShadow={false}
            />
            <mesh position={[0, 2.21, 0]}>
              <sphereGeometry args={[0.055, 12, 8]} />
              <meshBasicMaterial color="#fff0a6" toneMapped={false} />
            </mesh>
            <pointLight color="#ffd56c" intensity={0.65} distance={2.5} position={[0, 2.17, 0]} />
          </group>
        ))}

        <mesh
          ref={hitArea}
          position={[0, 1.28, 0]}
          onPointerMove={(event) => {
            if (!mobile && document.pointerLockElement !== gl.domElement) {
              event.stopPropagation();
              onFocus();
            }
          }}
          onPointerOut={() => {
            if (!mobile && document.pointerLockElement !== gl.domElement && focused) onBlur();
          }}
        >
          <boxGeometry args={[1.8, 2.25, 1.8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <Sparkles
          count={22}
          scale={[2.5, 2.8, 2.5]}
          position={[0, 1.25, 0]}
          size={1.8}
          speed={0.35}
          color="#fff0a6"
          opacity={focused ? 0.9 : 0.52}
        />
        <pointLight
          color={focused ? '#fff0a6' : '#ffb7d8'}
          intensity={focused ? 8 : 3.5}
          distance={8}
          position={[0, 1.8, 0.5]}
        />

        <Html position={[0, 2.85, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              color: focused ? '#fff0a6' : '#a99f72',
              fontFamily: 'var(--font-pixel), monospace',
              fontSize: 13,
              letterSpacing: '.18em',
              textAlign: 'center',
              textShadow: focused ? '0 0 18px #fff0a6' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            BIRTHDAY CAKE // OPEN MESSAGE
          </div>
        </Html>
      </group>
    </group>
  );
}

function TempleArchitecture({
  focused,
  mobile,
  observatoryEnabled,
  onFocus,
}: {
  focused: TempleFocus;
  mobile: boolean;
  observatoryEnabled: boolean;
  onFocus: (focus: TempleFocus) => void;
}) {
  return (
    <>
      <Grounds />
      <BridgeAndPools mobile={mobile} />
      <HeavenGate />
      <ObservatoryTelescope
        enabled={observatoryEnabled}
        focused={focused?.kind === 'telescope'}
        mobile={mobile}
        onFocus={onFocus}
      />
      <TempleHall position={[0, 0, -8]} size={[10, 12]} phase={0.52} tall />
      <TempleHall position={[-13, 0, -1]} size={[8, 7]} phase={0.36} />
      <TempleHall position={[13, 0, -1]} size={[8, 7]} phase={0.4} />
      <TempleHall position={[-13, 0, -14]} size={[7, 7]} phase={0.7} />
      <TempleHall position={[13, 0, -14]} size={[7.5, 7.5]} phase={0.74} gold />
      <GardenShrine />
      <ReflectionCourt />
    </>
  );
}

function HallColliders({ position, size }: { position: [number, number, number]; size: [number, number] }) {
  const [width, depth] = size;
  return (
    <>
      <CuboidCollider args={[width / 2, 1.9, 0.2]} position={[position[0], 1.9, position[2] - depth * 0.39]} />
      <CuboidCollider args={[0.2, 1.9, depth * 0.36]} position={[position[0] - width * 0.39, 1.9, position[2]]} />
      <CuboidCollider args={[0.2, 1.9, depth * 0.36]} position={[position[0] + width * 0.39, 1.9, position[2]]} />
    </>
  );
}

function WorldColliders() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[23, 0.25, 26]} position={[0, -0.35, 1]} />
      <CuboidCollider args={[0.5, 2, 26]} position={[-23, 1.5, 1]} />
      <CuboidCollider args={[0.5, 2, 26]} position={[23, 1.5, 1]} />
      <CuboidCollider args={[23, 2, 0.5]} position={[0, 1.5, -25]} />
      <CuboidCollider args={[23, 2, 0.5]} position={[0, 1.5, 27]} />
      <CuboidCollider args={[5, 0.85, 7.5]} position={[-6.2, 0.55, 15]} />
      <CuboidCollider args={[5, 0.85, 7.5]} position={[6.2, 0.55, 15]} />
      <HallColliders position={[0, 0, -8]} size={[10, 12]} />
      <HallColliders position={[-13, 0, -1]} size={[8, 7]} />
      <HallColliders position={[13, 0, -1]} size={[8, 7]} />
      <HallColliders position={[-13, 0, -14]} size={[7, 7]} />
      <HallColliders position={[13, 0, -14]} size={[7.5, 7.5]} />
    </RigidBody>
  );
}

function Player({
  enabled,
  transporting,
  panelOpen,
  mobile,
  mobileInput,
  teleport,
  focused,
  onFocus,
  onMemorySelect,
  onLetterCollect,
  onFinalSelect,
  onObservatorySelect,
}: {
  enabled: boolean;
  transporting: boolean;
  panelOpen: boolean;
  mobile: boolean;
  mobileInput: MutableRefObject<MobileMovementInput>;
  teleport: TempleTeleport | null;
  focused: TempleFocus;
  onFocus: (focus: TempleFocus) => void;
  onMemorySelect: (id: string) => void;
  onLetterCollect: (zoneId: string) => void;
  onFinalSelect: () => void;
  onObservatorySelect: () => void;
}) {
  const { camera, gl } = useThree();
  const body = useRef<RapierRigidBody>(null);
  const controls = useRef<ComponentRef<typeof PointerLockControls>>(null);
  const locked = useRef(false);
  const entered = useRef(false);
  const transportStarted = useRef(false);
  const transportElapsed = useRef(0);
  const transportStartPosition = useRef(new THREE.Vector3());
  const transportStartQuaternion = useRef(new THREE.Quaternion());
  const transportTargetQuaternion = useRef(new THREE.Quaternion());
  const transportStartFov = useRef(DEFAULT_FOV);
  const keys = useRef({ forward: false, backward: false, left: false, right: false, sprint: false });

  useEffect(() => {
    const update = (event: KeyboardEvent, pressed: boolean) => {
      if (event.code === 'KeyW' || event.code === 'ArrowUp') keys.current.forward = pressed;
      if (event.code === 'KeyS' || event.code === 'ArrowDown') keys.current.backward = pressed;
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') keys.current.left = pressed;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') keys.current.right = pressed;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.current.sprint = pressed;
      if (pressed && event.code === 'Escape') {
        controls.current?.unlock();
        if (document.pointerLockElement) void document.exitPointerLock();
        locked.current = false;
      }
      if (pressed && event.code === 'KeyE') {
        if (focused?.kind === 'memory') onMemorySelect(focused.id);
        if (focused?.kind === 'letter') onLetterCollect(focused.id);
        if (focused?.kind === 'cake') onFinalSelect();
        if (focused?.kind === 'telescope') onObservatorySelect();
      }
    };
    const down = (event: KeyboardEvent) => update(event, true);
    const up = (event: KeyboardEvent) => update(event, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [focused, onFinalSelect, onLetterCollect, onMemorySelect, onObservatorySelect]);

  useEffect(() => {
    const canvas = gl.domElement;
    const activateFocused = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        document.pointerLockElement !== canvas ||
        panelOpen ||
        transporting
      ) return;
      if (focused?.kind === 'memory') onMemorySelect(focused.id);
      if (focused?.kind === 'letter') onLetterCollect(focused.id);
      if (focused?.kind === 'cake') onFinalSelect();
      if (focused?.kind === 'telescope') onObservatorySelect();
    };
    canvas.addEventListener('pointerdown', activateFocused);
    return () => canvas.removeEventListener('pointerdown', activateFocused);
  }, [focused, gl, onFinalSelect, onLetterCollect, onMemorySelect, onObservatorySelect, panelOpen, transporting]);

  useEffect(() => {
    const syncPointerLock = () => {
      const isLocked = document.pointerLockElement === gl.domElement;
      locked.current = isLocked;
      if (!isLocked && !mobile) onFocus(null);
    };
    document.addEventListener('pointerlockchange', syncPointerLock);
    return () => document.removeEventListener('pointerlockchange', syncPointerLock);
  }, [gl, mobile, onFocus]);

  useEffect(() => {
    if (panelOpen || transporting) controls.current?.unlock();
    if (!transporting) {
      transportStarted.current = false;
      transportElapsed.current = 0;
    }
  }, [panelOpen, transporting]);

  useEffect(() => {
    if (!teleport || !body.current) return;
    body.current.setTranslation(
      { x: teleport.position[0], y: teleport.position[1], z: teleport.position[2] },
      true
    );
    body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    if (teleport.lookAt) {
      camera.position.set(
        teleport.position[0],
        teleport.position[1] + 0.72,
        teleport.position[2]
      );
      camera.rotation.order = 'YXZ';
      camera.lookAt(...teleport.lookAt);
      entered.current = true;
    }
  }, [camera, teleport]);

  useFrame((_, delta) => {
    if (!body.current) return;

    if (transporting) {
      if (!transportStarted.current) {
        transportStarted.current = true;
        transportElapsed.current = 0;
        transportStartPosition.current.copy(camera.position);
        transportStartQuaternion.current.copy(camera.quaternion);
        if (camera instanceof THREE.PerspectiveCamera) {
          transportStartFov.current = camera.fov;
        }
        const lookMatrix = new THREE.Matrix4().lookAt(
          new THREE.Vector3(-0.82, 1.03, 2.19),
          new THREE.Vector3(2.5, 2.89, 1.93),
          camera.up
        );
        transportTargetQuaternion.current.setFromRotationMatrix(lookMatrix);
      }

      transportElapsed.current += Math.min(delta, 0.05);
      const progress = THREE.MathUtils.clamp(transportElapsed.current / 2.7, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(
        transportStartPosition.current,
        new THREE.Vector3(-0.82, 1.03, 2.19),
        eased
      );
      camera.quaternion.slerpQuaternions(
        transportStartQuaternion.current,
        transportTargetQuaternion.current,
        eased
      );
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(transportStartFov.current, 30, eased);
        camera.updateProjectionMatrix();
      }
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    const translation = body.current.translation();
    if (enabled) {
      camera.position.set(translation.x, translation.y + 0.72, translation.z);
      if (!entered.current) {
        camera.rotation.order = 'YXZ';
        camera.lookAt(0, 2.35, 3);
        entered.current = true;
      }
    } else {
      entered.current = false;
    }

    if (translation.y < -4) {
      body.current.setTranslation({ x: 0, y: 1.2, z: 24 }, true);
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    if (mobile && enabled && !panelOpen) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y -= mobileInput.current.lookX * 0.0028;
      camera.rotation.x = THREE.MathUtils.clamp(
        camera.rotation.x - mobileInput.current.lookY * 0.0023,
        -1.22,
        1.22
      );
      mobileInput.current.lookX = THREE.MathUtils.damp(mobileInput.current.lookX, 0, 15, delta);
      mobileInput.current.lookY = THREE.MathUtils.damp(mobileInput.current.lookY, 0, 15, delta);
    }

    const canMove = enabled && !panelOpen;
    const movement = mobile ? mobileInput.current : keys.current;
    const forwardAmount = Number(movement.forward) - Number(movement.backward);
    const rightAmount = Number(movement.right) - Number(movement.left);
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    const right = new THREE.Vector3(direction.z, 0, -direction.x);
    const desired = direction.multiplyScalar(forwardAmount).add(right.multiplyScalar(rightAmount));
    if (desired.lengthSq() > 1) desired.normalize();
    const velocity = body.current.linvel();
    const speed = !mobile && keys.current.sprint ? 5.6 : 3.4;
    body.current.setLinvel(
      {
        x: canMove ? desired.x * speed : 0,
        y: velocity.y,
        z: canMove ? desired.z * speed : 0,
      },
      true
    );
  });

  return (
    <>
      <RigidBody
        ref={body}
        position={[0, 1.2, 24]}
        colliders={false}
        enabledRotations={[false, false, false]}
        linearDamping={7}
        friction={0}
        canSleep={false}
      >
        <CapsuleCollider args={[0.45, 0.32]} friction={0} />
      </RigidBody>
      {!mobile && (
        <PointerLockControls
          ref={controls}
          selector="#temple-enter, #temple-canvas"
          enabled={!panelOpen && !transporting}
          pointerSpeed={0.52}
          onLock={() => {
            locked.current = true;
          }}
          onUnlock={() => {
            locked.current = false;
            onFocus(null);
          }}
        />
      )}
    </>
  );
}

const DEFAULT_FOV = 60;
const MIN_FOV = 34;
const MAX_FOV = 140;

function CameraZoom({
  enabled,
  panelOpen,
  reducedMotion,
}: {
  enabled: boolean;
  panelOpen: boolean;
  reducedMotion: boolean;
}) {
  const { camera, gl } = useThree();
  const targetFov = useRef(DEFAULT_FOV);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const setFov = (next: number) => {
      targetFov.current = THREE.MathUtils.clamp(next, MIN_FOV, MAX_FOV);
      if (reducedMotion) {
        camera.fov = targetFov.current;
        camera.updateProjectionMatrix();
      }
    };
    const wheel = (event: WheelEvent) => {
      if (!enabled || panelOpen) return;
      event.preventDefault();
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      setFov(targetFov.current + delta * 0.075);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!enabled || panelOpen) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Equal' || event.code === 'NumpadAdd') {
        event.preventDefault();
        setFov(targetFov.current - 8);
      }
      if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
        event.preventDefault();
        setFov(targetFov.current + 8);
      }
      if (event.code === 'Digit0' || event.code === 'Numpad0') {
        event.preventDefault();
        setFov(DEFAULT_FOV);
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    return () => {
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
    };
  }, [camera, enabled, gl, panelOpen, reducedMotion]);

  useFrame((_, delta) => {
    if (!enabled || reducedMotion || !(camera instanceof THREE.PerspectiveCamera)) return;
    const next = THREE.MathUtils.damp(camera.fov, targetFov.current, 20, delta);
    if (Math.abs(next - camera.fov) < 0.001) return;
    camera.fov = next;
    camera.updateProjectionMatrix();
  });

  return null;
}

function ZoneTracker({
  zones,
  enabled,
  onZoneEnter,
}: {
  zones: TempleZone[];
  enabled: boolean;
  onZoneEnter: (zoneId: string | null) => void;
}) {
  const { camera } = useThree();
  const current = useRef<string | null>(null);

  useFrame(() => {
    if (!enabled) return;
    let closest: TempleZone | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const zone of zones) {
      const distance = Math.hypot(camera.position.x - zone.position[0], camera.position.z - zone.position[2]);
      if (distance < zone.radius && distance < closestDistance) {
        closest = zone;
        closestDistance = distance;
      }
    }
    const next = closest?.id ?? null;
    if (next !== current.current) {
      current.current = next;
      onZoneEnter(next);
    }
  });

  return null;
}

function CinematicCamera({
  started,
  reducedMotion,
  replayKey,
  mode,
  onComplete,
}: {
  started: boolean;
  reducedMotion: boolean;
  replayKey: number;
  mode: TempleMaterialMode;
  onComplete: () => void;
}) {
  const { camera } = useThree();
  const { progress } = useReveal();
  const rearTarget = useMemo(() => new THREE.Vector3(0, 0.8, -3), []);
  const entranceTarget = useMemo(() => new THREE.Vector3(0, 2.35, 3), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const completed = useRef(false);

  useEffect(() => {
    completed.current = false;
  }, [mode, replayKey]);

  useFrame(() => {
    if (started) return;
    const t = reducedMotion ? 1 : THREE.MathUtils.smoothstep(progress.current, 0, 1);
    const angle = THREE.MathUtils.lerp(Math.PI + 0.18, 0, t);
    const radius = THREE.MathUtils.lerp(32, 25, t);
    camera.position.set(
      Math.sin(angle) * radius,
      THREE.MathUtils.lerp(28, 1.92, t),
      Math.cos(angle) * radius - 1
    );
    lookAt.lerpVectors(rearTarget, entranceTarget, t);
    camera.lookAt(lookAt);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(MAX_FOV, DEFAULT_FOV, t);
      camera.updateProjectionMatrix();
    }

    if (progress.current < 0.995) completed.current = false;
    if (progress.current >= 0.999 && !completed.current) {
      completed.current = true;
      onComplete();
    }
  }, -1);

  return null;
}

function TempleWorld(props: TempleSceneProps) {
  const revealProgress = useRef(
    props.skipReveal ? (props.mode === 'pearl' ? 1 : 0) : 0
  );
  const environmentColor = props.mode === 'wireframe' ? '#5de8ff' : '#dffaff';

  return (
    <RevealContext.Provider value={{ progress: revealProgress }}>
      <RevealDirector mode={props.mode} replayKey={props.replayKey} reducedMotion={props.reducedMotion} />
      <CinematicCamera
        started={props.started}
        reducedMotion={props.reducedMotion}
        replayKey={props.replayKey}
        mode={props.mode}
        onComplete={props.onCinematicComplete}
      />
      <CameraZoom
        enabled={props.started && !props.transporting}
        panelOpen={props.panelOpen}
        reducedMotion={props.reducedMotion}
      />
      <fog attach="fog" args={['#07101d', 34, 78]} />
      <color attach="background" args={['#07101d']} />
      <ambientLight intensity={0.42} color="#a8d6ee" />
      <hemisphereLight args={['#a8d9ff', '#152035', 1.4]} />
      <directionalLight
        castShadow={!props.mobile}
        color="#d9ecff"
        intensity={3.2}
        position={[-12, 22, 10]}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={70}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      <pointLight color="#6cdfff" intensity={6} distance={36} position={[0, 8, 9]} />
      <pointLight color="#ffd56c" intensity={5} distance={24} position={[13, 7, -14]} />

      <Environment resolution={128}>
        <Lightformer form="ring" intensity={2} color={environmentColor} scale={18} position={[0, 16, -12]} target={[0, 0, -6]} />
        <Lightformer form="rect" intensity={1.2} color="#d5eaff" scale={[22, 5]} position={[-18, 8, 12]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#7ca8ff" scale={[18, 6]} position={[20, 4, -8]} target={[0, 0, -5]} />
      </Environment>

      <Sparkles count={props.mobile ? 85 : 210} scale={[44, 18, 50]} size={1.1} speed={0.18} color="#d9fbff" opacity={0.46} />
      <TempleArchitecture
        focused={props.focused}
        mobile={props.mobile}
        observatoryEnabled={props.started && !props.transporting}
        onFocus={props.onFocus}
      />
      <Exhibits
        dataset={props.dataset}
        activeZoneId={props.activeZoneId}
        mobile={props.mobile}
        mode={props.mode}
        focused={props.focused}
        onFocus={props.onFocus}
      />
      <TempleLetters
        zones={props.dataset.temple.zones}
        assignments={props.letterAssignments}
        collectedZoneIds={props.collectedLetterZoneIds}
        activeZoneId={props.activeZoneId}
        focused={props.focused}
        mobile={props.mobile}
        onFocus={props.onFocus}
      />
      <SanctumDoor
        unlocked={props.finalUnlocked}
        collectedLetterCount={props.collectedLetterCount}
        requiredCount={props.dataset.temple.sanctumWord.length}
      />
      {props.finalUnlocked && (
        <BirthdayCakeAltar
          focused={props.focused?.kind === 'cake'}
          mobile={props.mobile}
          onFocus={() => props.onFocus({ kind: 'cake', id: 'birthday-cake' })}
          onBlur={() => props.onFocus(null)}
        />
      )}

      <Suspense fallback={null}>
        <Physics gravity={[0, -18, 0]} timeStep="vary">
          <WorldColliders />
          {props.finalUnlocked && (
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[0.88, 0.68, 0.88]} position={[0, 0.72, -6.25]} />
            </RigidBody>
          )}
          <Player
            enabled={props.started}
            transporting={props.transporting}
            panelOpen={props.panelOpen}
            mobile={props.mobile}
            mobileInput={props.mobileInput}
            teleport={props.teleport}
            focused={props.focused}
            onFocus={props.onFocus}
            onMemorySelect={props.onMemorySelect}
            onLetterCollect={props.onLetterCollect}
            onFinalSelect={props.onFinalSelect}
            onObservatorySelect={props.onObservatorySelect}
          />
        </Physics>
      </Suspense>

      <ZoneTracker
        zones={props.dataset.temple.zones}
        enabled={props.started}
        onZoneEnter={props.onZoneEnter}
      />

      {!props.mobile && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom intensity={0.65} luminanceThreshold={0.78} luminanceSmoothing={0.24} mipmapBlur />
          <Vignette darkness={0.48} offset={0.22} />
        </EffectComposer>
      )}
    </RevealContext.Provider>
  );
}

export default function TempleScene(props: TempleSceneProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return (
    <Canvas
      id="temple-canvas"
      aria-hidden="true"
      shadows={!props.mobile}
      camera={{ position: [23, 15, 30], fov: DEFAULT_FOV, near: 0.08, far: 130 }}
      dpr={props.mobile || props.reducedMotion ? 1 : [1, 1.45]}
      frameloop={visible ? 'always' : 'never'}
      gl={{ antialias: !props.mobile, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
      }}
    >
      <TempleWorld {...props} />
    </Canvas>
  );
}
