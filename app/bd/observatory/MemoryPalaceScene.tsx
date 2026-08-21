'use client';

import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Html, Line as DreiLine, OrbitControls, Stars } from '@react-three/drei';
import {
  type ComponentRef,
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import {
  CLUSTER_LOCATIONS,
  type ObservatoryPlanetId,
} from '@/lib/birthday/observatory';
import type { BirthdayCluster, BirthdayDataset } from '@/lib/birthday/types';

type SceneProps = {
  dataset: BirthdayDataset;
  activeClusterId: string | null;
  activeMemoryId: string | null;
  finalUnlocked: boolean;
  reducedMotion: boolean;
  arriving: boolean;
  departing: boolean;
  onClusterSelect: (clusterId: string) => void;
  onMemorySelect: (memoryId: string) => void;
  onPortalSelect: () => void;
  onTempleReturn: () => void;
  onArrivalComplete: () => void;
  onInteract: () => void;
};

type SurfaceKind =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

type MajorMoon = {
  name: string;
  radius: number;
  distance: number;
  speed: number;
  color: string;
};

type PlanetData = {
  id: ObservatoryPlanetId;
  name: string;
  classification?: string;
  distance: number;
  radius: number;
  orbitSpeed: number;
  rotationSpeed: number;
  startAngle: number;
  inclination: number;
  surface: SurfaceKind;
  moonCount: number;
  majorMoons: MajorMoon[];
  ring?: { inner: number; outer: number; color: string; opacity: number };
};

const PLANETS: PlanetData[] = [
  {
    id: 'mercury',
    name: 'MERCURY',
    distance: 4.5,
    radius: 0.34,
    orbitSpeed: 0.095,
    rotationSpeed: 0.16,
    startAngle: 0.35,
    inclination: 0.08,
    surface: 'mercury',
    moonCount: 0,
    majorMoons: [],
  },
  {
    id: 'venus',
    name: 'VENUS',
    distance: 6.1,
    radius: 0.57,
    orbitSpeed: 0.072,
    rotationSpeed: -0.055,
    startAngle: 2.45,
    inclination: 0.035,
    surface: 'venus',
    moonCount: 0,
    majorMoons: [],
  },
  {
    id: 'earth',
    name: 'EARTH',
    distance: 7.8,
    radius: 0.61,
    orbitSpeed: 0.058,
    rotationSpeed: 0.38,
    startAngle: 4.7,
    inclination: 0,
    surface: 'earth',
    moonCount: 1,
    majorMoons: [
      { name: 'MOON', radius: 0.15, distance: 1.12, speed: 0.56, color: '#c8c6bd' },
    ],
  },
  {
    id: 'mars',
    name: 'MARS',
    distance: 9.6,
    radius: 0.43,
    orbitSpeed: 0.047,
    rotationSpeed: 0.34,
    startAngle: 1.25,
    inclination: 0.06,
    surface: 'mars',
    moonCount: 2,
    majorMoons: [
      { name: 'PHOBOS', radius: 0.065, distance: 0.78, speed: 0.95, color: '#a49786' },
      { name: 'DEIMOS', radius: 0.052, distance: 1.08, speed: 0.58, color: '#bbb0a0' },
    ],
  },
  {
    id: 'jupiter',
    name: 'JUPITER',
    distance: 12.7,
    radius: 1.42,
    orbitSpeed: 0.026,
    rotationSpeed: 0.52,
    startAngle: 4.25,
    inclination: 0.025,
    surface: 'jupiter',
    moonCount: 101,
    majorMoons: [
      { name: 'IO', radius: 0.12, distance: 2.05, speed: 0.74, color: '#e8c96e' },
      { name: 'EUROPA', radius: 0.11, distance: 2.48, speed: 0.57, color: '#d7cbb8' },
      { name: 'GANYMEDE', radius: 0.17, distance: 2.96, speed: 0.42, color: '#aaa28f' },
      { name: 'CALLISTO', radius: 0.155, distance: 3.48, speed: 0.31, color: '#7f786f' },
    ],
  },
  {
    id: 'saturn',
    name: 'SATURN',
    distance: 16.15,
    radius: 1.2,
    orbitSpeed: 0.018,
    rotationSpeed: 0.47,
    startAngle: 5.65,
    inclination: 0.055,
    surface: 'saturn',
    moonCount: 285,
    ring: { inner: 1.5, outer: 2.35, color: '#d7c692', opacity: 0.68 },
    majorMoons: [
      { name: 'MIMAS', radius: 0.06, distance: 2.55, speed: 0.86, color: '#c9c5b8' },
      { name: 'ENCELADUS', radius: 0.075, distance: 2.82, speed: 0.73, color: '#e8edf0' },
      { name: 'TETHYS', radius: 0.09, distance: 3.1, speed: 0.63, color: '#d7d3ca' },
      { name: 'DIONE', radius: 0.09, distance: 3.38, speed: 0.53, color: '#c9c6bd' },
      { name: 'RHEA', radius: 0.105, distance: 3.72, speed: 0.43, color: '#b8b5ae' },
      { name: 'TITAN', radius: 0.18, distance: 4.16, speed: 0.31, color: '#d4a34c' },
      { name: 'IAPETUS', radius: 0.095, distance: 4.62, speed: 0.2, color: '#8b8172' },
    ],
  },
  {
    id: 'uranus',
    name: 'URANUS',
    distance: 19.8,
    radius: 0.83,
    orbitSpeed: 0.013,
    rotationSpeed: -0.25,
    startAngle: 0.9,
    inclination: 0.04,
    surface: 'uranus',
    moonCount: 28,
    ring: { inner: 1.17, outer: 1.55, color: '#bfe3dd', opacity: 0.22 },
    majorMoons: [
      { name: 'MIRANDA', radius: 0.06, distance: 1.32, speed: 0.72, color: '#bfc5c4' },
      { name: 'ARIEL', radius: 0.085, distance: 1.58, speed: 0.58, color: '#d2d6d2' },
      { name: 'UMBRIEL', radius: 0.08, distance: 1.86, speed: 0.46, color: '#7f8584' },
      { name: 'TITANIA', radius: 0.105, distance: 2.18, speed: 0.36, color: '#b5b9b4' },
      { name: 'OBERON', radius: 0.1, distance: 2.5, speed: 0.29, color: '#999b96' },
    ],
  },
  {
    id: 'neptune',
    name: 'NEPTUNE',
    distance: 22.8,
    radius: 0.8,
    orbitSpeed: 0.01,
    rotationSpeed: 0.28,
    startAngle: 4.2,
    inclination: 0.07,
    surface: 'neptune',
    moonCount: 16,
    majorMoons: [
      { name: 'PROTEUS', radius: 0.06, distance: 1.28, speed: 0.69, color: '#858a8b' },
      { name: 'TRITON', radius: 0.14, distance: 1.72, speed: -0.48, color: '#c6c5ba' },
      { name: 'NEREID', radius: 0.05, distance: 2.22, speed: 0.22, color: '#9d9e99' },
    ],
  },
  {
    id: 'pluto',
    name: 'PLUTO',
    classification: 'DWARF PLANET',
    distance: 25.7,
    radius: 0.3,
    orbitSpeed: 0.007,
    rotationSpeed: -0.12,
    startAngle: 4.9,
    inclination: 0.16,
    surface: 'pluto',
    moonCount: 5,
    majorMoons: [
      { name: 'CHARON', radius: 0.145, distance: 0.72, speed: 0.48, color: '#a7a19a' },
      { name: 'STYX', radius: 0.025, distance: 0.93, speed: 0.38, color: '#bab6ad' },
      { name: 'NIX', radius: 0.034, distance: 1.08, speed: 0.31, color: '#c8c3ba' },
      { name: 'KERBEROS', radius: 0.027, distance: 1.23, speed: 0.26, color: '#8e8982' },
      { name: 'HYDRA', radius: 0.035, distance: 1.38, speed: 0.22, color: '#c3beb5' },
    ],
  },
];

const SURFACE_PALETTES: Record<SurfaceKind, string[]> = {
  sun: ['#ff8a16', '#ffc33c', '#fff0a3'],
  mercury: ['#45474a', '#86847e', '#b2ada3'],
  venus: ['#9a672e', '#d6a65b', '#f0d28f'],
  earth: ['#082f68', '#176ca0', '#5f934f'],
  mars: ['#6b2919', '#ad4f2e', '#d78450'],
  jupiter: ['#7b5743', '#c39771', '#ead4ae'],
  saturn: ['#8f7956', '#cdb98a', '#eadab3'],
  uranus: ['#79bcc0', '#a8dadd', '#d6f0ec'],
  neptune: ['#173d96', '#2867d1', '#70a5ee'],
  pluto: ['#66594f', '#a9927e', '#d2bda6'],
};

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSurfaceTexture(kind: SurfaceKind) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const palette = SURFACE_PALETTES[kind];
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.5, palette[2]);
  gradient.addColorStop(1, palette[0]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const random = mulberry32(kind.split('').reduce((sum, character) => sum + character.charCodeAt(0), 17));

  if (kind === 'jupiter' || kind === 'saturn' || kind === 'venus' || kind === 'neptune') {
    const bands = kind === 'jupiter' ? 22 : kind === 'saturn' ? 28 : 17;
    for (let index = 0; index < bands; index += 1) {
      const y = (index / bands) * canvas.height;
      context.fillStyle = `${palette[index % palette.length]}${kind === 'neptune' ? '75' : 'a8'}`;
      context.fillRect(0, y, canvas.width, 4 + random() * 10);
    }
  }

  if (kind === 'earth') {
    context.fillStyle = '#1977a9';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const continents = [
      [73, 73, 46, 30],
      [117, 121, 30, 48],
      [253, 73, 55, 29],
      [291, 111, 35, 54],
      [385, 142, 32, 23],
      [463, 67, 44, 31],
    ];
    continents.forEach(([x, y, rx, ry], index) => {
      context.beginPath();
      context.ellipse(x, y, rx, ry, (index - 2) * 0.28, 0, Math.PI * 2);
      context.fillStyle = index % 2 ? '#668f49' : '#8e9f55';
      context.fill();
    });
    context.fillStyle = 'rgba(238, 249, 250, .8)';
    context.fillRect(0, 0, canvas.width, 11);
    context.fillRect(0, canvas.height - 14, canvas.width, 14);
    for (let index = 0; index < 34; index += 1) {
      context.beginPath();
      context.ellipse(random() * 512, 20 + random() * 215, 12 + random() * 30, 1 + random() * 4, random(), 0, Math.PI * 2);
      context.fillStyle = 'rgba(255,255,255,.22)';
      context.fill();
    }
  } else if (kind === 'sun') {
    for (let index = 0; index < 950; index += 1) {
      const radius = 0.5 + random() * 4.5;
      context.beginPath();
      context.arc(random() * 512, random() * 256, radius, 0, Math.PI * 2);
      context.fillStyle = random() > 0.72 ? 'rgba(255,245,162,.42)' : 'rgba(130,34,0,.18)';
      context.fill();
    }
  } else if (kind !== 'jupiter' && kind !== 'saturn' && kind !== 'venus' && kind !== 'neptune') {
    const amount = kind === 'mercury' ? 220 : 125;
    for (let index = 0; index < amount; index += 1) {
      const radius = 1 + random() * (kind === 'mercury' ? 8 : 14);
      context.beginPath();
      context.arc(random() * 512, random() * 256, radius, 0, Math.PI * 2);
      context.fillStyle = random() > 0.5 ? 'rgba(255,255,255,.1)' : 'rgba(22,8,3,.16)';
      context.fill();
    }
  }

  if (kind === 'jupiter') {
    context.beginPath();
    context.ellipse(405, 163, 34, 14, -0.08, 0, Math.PI * 2);
    context.fillStyle = '#a84d34';
    context.fill();
    context.strokeStyle = 'rgba(255,216,171,.55)';
    context.lineWidth = 4;
    context.stroke();
  }

  if (kind === 'neptune') {
    context.beginPath();
    context.ellipse(354, 150, 28, 15, -0.2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(4,20,75,.65)';
    context.fill();
  }

  if (kind === 'pluto') {
    context.save();
    context.translate(305, 117);
    context.rotate(-0.18);
    context.beginPath();
    context.moveTo(0, 18);
    context.bezierCurveTo(-54, -18, -38, -67, 0, -38);
    context.bezierCurveTo(38, -67, 54, -18, 0, 18);
    context.fillStyle = 'rgba(232,215,190,.58)';
    context.fill();
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function surfaceMix(elapsed: number, reducedMotion: boolean) {
  if (reducedMotion) return 1;
  const phase = elapsed % 12;
  if (phase < 1.6) return 0;
  if (phase < 4.1) return THREE.MathUtils.smoothstep(phase, 1.6, 4.1);
  if (phase < 9.4) return 1;
  return 1 - THREE.MathUtils.smoothstep(phase, 9.4, 12);
}

function usePointerCursor(hovered: boolean, enabled = true) {
  useEffect(() => {
    if (!hovered || !enabled) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = previous;
    };
  }, [enabled, hovered]);
}

function PlanetSurface({
  planet,
  active,
  reducedMotion,
  interactive,
  onSelect,
}: {
  planet: PlanetData;
  active: boolean;
  reducedMotion: boolean;
  interactive: boolean;
  onSelect?: () => void;
}) {
  const spinner = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Group>(null);
  const surfaceMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const wireMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const ringMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const ringWireMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const texture = useMemo(() => makeSurfaceTexture(planet.surface), [planet.surface]);
  usePointerCursor(hovered, interactive);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state, delta) => {
    if (spinner.current && !reducedMotion) {
      spinner.current.rotation.y += delta * planet.rotationSpeed;
    }
    if (shell.current) {
      const target = active ? 1.12 : hovered && interactive ? 1.07 : 1;
      shell.current.scale.setScalar(THREE.MathUtils.damp(shell.current.scale.x, target, 8, delta));
    }
    const mix = surfaceMix(state.clock.elapsedTime, reducedMotion);
    if (surfaceMaterial.current) surfaceMaterial.current.opacity = 0.035 + mix * 0.965;
    if (wireMaterial.current) wireMaterial.current.opacity = 0.08 + (1 - mix) * (active ? 0.94 : 0.76);
    if (ringMaterial.current && planet.ring) ringMaterial.current.opacity = planet.ring.opacity * (0.15 + mix * 0.85);
    if (ringWireMaterial.current) ringWireMaterial.current.opacity = 0.04 + (1 - mix) * 0.3;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect?.();
  };

  return (
    <group
      ref={shell}
      onClick={interactive ? handleClick : undefined}
      onPointerOver={
        interactive
          ? (event) => {
              event.stopPropagation();
              setHovered(true);
            }
          : undefined
      }
      onPointerOut={interactive ? () => setHovered(false) : undefined}
    >
      <group ref={spinner} rotation={[0, 0, planet.id === 'uranus' ? Math.PI * 0.46 : planet.inclination * 2]}>
        <mesh>
          <sphereGeometry args={[planet.radius, 48, 32]} />
          <meshStandardMaterial
            ref={surfaceMaterial}
            map={texture}
            color="#ffffff"
            roughness={planet.id === 'earth' ? 0.68 : 0.9}
            metalness={0}
            transparent
          />
        </mesh>
        <mesh scale={1.012}>
          <sphereGeometry args={[planet.radius, 28, 18]} />
          <meshBasicMaterial
            ref={wireMaterial}
            color={active ? '#fff3a3' : '#7ff7ff'}
            wireframe
            transparent
            depthWrite={false}
          />
        </mesh>
      </group>

      {planet.ring && (
        <group rotation={[Math.PI / 2 + planet.inclination * 2, 0, planet.id === 'uranus' ? Math.PI * 0.46 : 0]}>
          <mesh>
            <ringGeometry args={[planet.ring.inner, planet.ring.outer, 128]} />
            <meshStandardMaterial
              ref={ringMaterial}
              color={planet.ring.color}
              roughness={0.86}
              side={THREE.DoubleSide}
              transparent
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.004]}>
            <ringGeometry args={[planet.ring.inner, planet.ring.outer, 56, 8]} />
            <meshBasicMaterial
              ref={ringWireMaterial}
              color="#baf8ff"
              wireframe
              side={THREE.DoubleSide}
              transparent
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {(active || hovered) && interactive && (
        <pointLight color={active ? '#fff3a3' : '#7ff7ff'} intensity={2.5} distance={5} />
      )}
    </group>
  );
}

function moonOrbitPoints(radius: number) {
  return Array.from({ length: 65 }, (_, index) => {
    const angle = (index / 64) * Math.PI * 2;
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as [number, number, number];
  });
}

function NamedMoon({
  moon,
  index,
  cluster,
  selected,
  systemActive,
  reducedMotion,
  onClusterSelect,
}: {
  moon: MajorMoon;
  index: number;
  cluster?: BirthdayCluster;
  selected: boolean;
  systemActive: boolean;
  reducedMotion: boolean;
  onClusterSelect: (clusterId: string) => void;
}) {
  const pivot = useRef<THREE.Group>(null);
  const surfaceMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const wireMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const points = useMemo(() => moonOrbitPoints(moon.distance), [moon.distance]);
  const interactive = Boolean(cluster);
  usePointerCursor(hovered, interactive);

  useFrame((state) => {
    if (pivot.current) {
      pivot.current.rotation.y = index * 1.7 + (reducedMotion ? 0 : state.clock.elapsedTime * moon.speed);
    }
    const mix = surfaceMix(state.clock.elapsedTime, reducedMotion);
    if (surfaceMaterial.current) surfaceMaterial.current.opacity = 0.18 + mix * 0.82;
    if (wireMaterial.current) {
      wireMaterial.current.opacity = 0.04 + (1 - mix) * (selected ? 0.94 : 0.72);
      wireMaterial.current.color.set(selected ? cluster?.color ?? '#fff3a3' : '#baf8ff');
    }
  });

  return (
    <>
      <DreiLine
        points={points}
        color={selected ? cluster?.color ?? '#fff3a3' : cluster?.color ?? '#7fa6aa'}
        lineWidth={selected ? 0.8 : 0.35}
        transparent
        opacity={selected ? 0.56 : systemActive ? 0.2 : cluster ? 0.16 : 0.07}
      />
      <group ref={pivot} rotation={[0, index * 1.7, (index % 3 - 1) * 0.08]}>
        <group
          position={[moon.distance, 0, 0]}
          onClick={
            cluster
              ? (event) => {
                  event.stopPropagation();
                  onClusterSelect(cluster.id);
                }
              : undefined
          }
          onPointerOver={
            cluster
              ? (event) => {
                  event.stopPropagation();
                  setHovered(true);
                }
              : undefined
          }
          onPointerOut={cluster ? () => setHovered(false) : undefined}
        >
          {cluster && (
            <mesh>
              <sphereGeometry args={[Math.max(moon.radius * 2.5, 0.22), 10, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
          <mesh>
            <sphereGeometry args={[moon.radius, 14, 10]} />
            <meshStandardMaterial
              ref={surfaceMaterial}
              color={selected ? cluster?.color ?? moon.color : moon.color}
              roughness={1}
              transparent
            />
          </mesh>
          <mesh scale={1.025}>
            <sphereGeometry args={[moon.radius, 8, 6]} />
            <meshBasicMaterial
              ref={wireMaterial}
              color="#baf8ff"
              wireframe
              transparent
              depthWrite={false}
            />
          </mesh>
          {(cluster || (systemActive && moon.radius >= 0.085)) && (
            <Html position={[0, moon.radius + 0.12, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
              <span
                style={{
                  color: selected ? cluster?.color ?? '#fff3a3' : cluster?.color ?? '#78969a',
                  fontFamily: 'var(--font-courier), monospace',
                  fontSize: cluster ? 8 : 7,
                  letterSpacing: '.14em',
                  whiteSpace: 'nowrap',
                  textShadow: selected ? `0 0 12px ${cluster?.color ?? '#fff3a3'}` : undefined,
                }}
              >
                {moon.name}
              </span>
            </Html>
          )}
          {(selected || hovered) && cluster && (
            <pointLight color={cluster.color} intensity={2.2} distance={2.2} />
          )}
        </group>
      </group>
    </>
  );
}

function InstancedMoons({
  count,
  planet,
  reducedMotion,
}: {
  count: number;
  planet: PlanetData;
  reducedMotion: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const moons = useMemo(() => {
    const random = mulberry32(planet.name.length * 101 + planet.moonCount);
    const lastMajor = planet.majorMoons[planet.majorMoons.length - 1];
    const start = Math.max(
      planet.ring ? planet.ring.outer * 1.08 : planet.radius * 1.65,
      lastMajor ? lastMajor.distance * 1.05 : planet.radius * 1.65
    );
    return Array.from({ length: count }, (_, index) => ({
      radius: start + random() * Math.max(0.8, planet.radius * 2.7),
      angle: random() * Math.PI * 2,
      speed: (0.11 + random() * 0.38) * (index % 9 === 0 ? -1 : 1),
      inclination: (random() - 0.5) * 0.62,
      scale: 0.018 + random() * 0.027,
    }));
  }, [count, planet]);

  useFrame((state) => {
    if (!mesh.current || !material.current) return;
    const elapsed = reducedMotion ? 0 : state.clock.elapsedTime;
    moons.forEach((moon, index) => {
      const angle = moon.angle + elapsed * moon.speed;
      dummy.position.set(
        Math.cos(angle) * moon.radius,
        Math.sin(angle * 1.37) * moon.inclination,
        Math.sin(angle) * moon.radius
      );
      dummy.scale.setScalar(moon.scale);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    material.current.opacity = 0.38 + surfaceMix(state.clock.elapsedTime, reducedMotion) * 0.5;
  });

  if (count <= 0) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 4]} />
      <meshStandardMaterial ref={material} color="#b8c1bd" roughness={1} transparent />
    </instancedMesh>
  );
}

function MoonSystem({
  planet,
  systemActive,
  activeClusterId,
  moonClusters,
  reducedMotion,
  onClusterSelect,
}: {
  planet: PlanetData;
  systemActive: boolean;
  activeClusterId: string | null;
  moonClusters: ReadonlyMap<string, BirthdayCluster>;
  reducedMotion: boolean;
  onClusterSelect: (clusterId: string) => void;
}) {
  const minorCount = Math.max(0, planet.moonCount - planet.majorMoons.length);
  return (
    <group>
      {planet.majorMoons.map((moon, index) => {
        const cluster = moonClusters.get(moon.name);
        return (
          <NamedMoon
            key={moon.name}
            moon={moon}
            index={index}
            cluster={cluster}
            selected={Boolean(cluster && cluster.id === activeClusterId)}
            systemActive={systemActive}
            reducedMotion={reducedMotion}
            onClusterSelect={onClusterSelect}
          />
        );
      })}
      <InstancedMoons count={minorCount} planet={planet} reducedMotion={reducedMotion} />
    </group>
  );
}

function orbitPosition(planet: PlanetData, elapsed: number) {
  const angle = planet.startAngle + elapsed * planet.orbitSpeed;
  return new THREE.Vector3(
    Math.cos(angle) * planet.distance,
    Math.sin(angle * 1.3) * planet.inclination * 3.5,
    Math.sin(angle) * planet.distance * 0.82
  );
}

function PlanetOrbit({
  planet,
  cluster,
  moonClusters,
  planetActive,
  systemActive,
  activeClusterId,
  reducedMotion,
  simulationTime,
  onClusterSelect,
}: {
  planet: PlanetData;
  cluster?: BirthdayCluster;
  moonClusters: ReadonlyMap<string, BirthdayCluster>;
  planetActive: boolean;
  systemActive: boolean;
  activeClusterId: string | null;
  reducedMotion: boolean;
  simulationTime: MutableRefObject<number>;
  onClusterSelect: (clusterId: string) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const orbit = useMemo(() => {
    return Array.from({ length: 129 }, (_, index) => {
      const angle = (index / 128) * Math.PI * 2;
      return [
        Math.cos(angle) * planet.distance,
        Math.sin(angle * 1.3) * planet.inclination * 3.5,
        Math.sin(angle) * planet.distance * 0.82,
      ] as [number, number, number];
    });
  }, [planet]);

  useFrame(() => {
    if (!group.current) return;
    group.current.position.copy(orbitPosition(planet, reducedMotion ? 0 : simulationTime.current));
  });

  return (
    <>
      <DreiLine
        points={orbit}
        color={systemActive ? '#fff3a3' : '#477177'}
        lineWidth={systemActive ? 0.85 : 0.42}
        transparent
        opacity={systemActive ? 0.46 : 0.14}
      />
      <group ref={group} position={orbitPosition(planet, 0)}>
        <PlanetSurface
          planet={planet}
          active={planetActive}
          reducedMotion={reducedMotion}
          interactive={Boolean(cluster)}
          onSelect={cluster ? () => onClusterSelect(cluster.id) : undefined}
        />
        <MoonSystem
          planet={planet}
          systemActive={systemActive}
          activeClusterId={activeClusterId}
          moonClusters={moonClusters}
          reducedMotion={reducedMotion}
          onClusterSelect={onClusterSelect}
        />
        <Html
          position={[0, planet.radius + (planet.ring ? 1.4 : 0.55), 0]}
          center
          distanceFactor={17}
          style={{ pointerEvents: 'none' }}
        >
          <div
            aria-hidden="true"
            style={{
              color: planetActive ? '#fff3a3' : cluster ? '#a7dce0' : '#66868a',
              fontFamily: 'var(--font-pixel), monospace',
              fontSize: planetActive ? 14 : 11,
              letterSpacing: '.19em',
              whiteSpace: 'nowrap',
              textShadow: planetActive ? '0 0 16px #fff3a3' : '0 0 10px rgba(127,247,255,.3)',
            }}
          >
            {planet.name}
          </div>
          <div
            aria-hidden="true"
            style={{
              marginTop: 4,
              color: planetActive ? '#9d9461' : '#425e62',
              fontFamily: 'var(--font-courier), monospace',
              fontSize: 7,
              letterSpacing: '.14em',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {planet.classification ? `${planet.classification} · ` : ''}
            {planet.moonCount.toString().padStart(3, '0')} {planet.moonCount === 1 ? 'MOON' : 'MOONS'}
          </div>
        </Html>
      </group>
    </>
  );
}

function SunPortal({
  finalUnlocked,
  reducedMotion,
  onPortalSelect,
  onTempleReturn,
}: {
  finalUnlocked: boolean;
  reducedMotion: boolean;
  onPortalSelect: () => void;
  onTempleReturn: () => void;
}) {
  const spinner = useRef<THREE.Group>(null);
  const corona = useRef<THREE.Mesh>(null);
  const surfaceMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const wireMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const texture = useMemo(() => makeSurfaceTexture('sun'), []);
  usePointerCursor(hovered, finalUnlocked);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state, delta) => {
    if (spinner.current && !reducedMotion) spinner.current.rotation.y += delta * 0.08;
    if (corona.current && !reducedMotion) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.35) * 0.035;
      corona.current.scale.setScalar(pulse);
    }
    const mix = surfaceMix(state.clock.elapsedTime, reducedMotion);
    if (surfaceMaterial.current) surfaceMaterial.current.opacity = 0.08 + mix * 0.92;
    if (wireMaterial.current) wireMaterial.current.opacity = 0.1 + (1 - mix) * 0.82;
  });

  return (
    <group>
      <group
        ref={spinner}
        onClick={(event) => {
          event.stopPropagation();
          if (finalUnlocked) onPortalSelect();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          if (finalUnlocked) setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh>
          <sphereGeometry args={[2.15, 56, 40]} />
          <meshBasicMaterial ref={surfaceMaterial} map={texture} color="#fff3bd" transparent />
        </mesh>
        <mesh scale={1.012}>
          <sphereGeometry args={[2.15, 30, 22]} />
          <meshBasicMaterial
            ref={wireMaterial}
            color={finalUnlocked ? '#fff3a3' : '#7ff7ff'}
            wireframe
            transparent
            depthWrite={false}
          />
        </mesh>
      </group>
      <mesh ref={corona} scale={1.08}>
        <sphereGeometry args={[2.15, 32, 24]} />
        <meshBasicMaterial
          color={finalUnlocked ? '#fff0a0' : '#ff9d2e'}
          transparent
          opacity={hovered ? 0.14 : 0.07}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      <pointLight color="#ffd28b" intensity={115} distance={68} decay={1.4} />
      <Html position={[0, -2.85, 0]} center distanceFactor={14} style={{ pointerEvents: 'none' }}>
        <div
          aria-hidden="true"
          style={{
            color: finalUnlocked ? '#fff3a3' : '#dbb067',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 14,
            letterSpacing: '.24em',
            whiteSpace: 'nowrap',
            textShadow: finalUnlocked ? '0 0 18px #fff3a3' : '0 0 12px rgba(255,164,63,.45)',
          }}
        >
          SUN // {finalUnlocked ? 'PORTAL READY' : 'SOLAR CORE'}
        </div>
      </Html>
      <Html position={[0, -3.7, 0]} center distanceFactor={14}>
        <button
          type="button"
          aria-label="Return to the 2026 temple"
          onClick={(event) => {
            event.stopPropagation();
            onTempleReturn();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            border: '1px solid rgba(255,243,163,.72)',
            background: 'rgba(7,12,18,.82)',
            boxShadow: '0 0 18px rgba(255,211,106,.2)',
            color: '#fff3a3',
            cursor: 'pointer',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 10,
            letterSpacing: '.16em',
            padding: '8px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          ← RETURN TO TEMPLE
        </button>
      </Html>
    </group>
  );
}

function AsteroidBelt({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const asteroids = useMemo(() => {
    const random = mulberry32(1977);
    return Array.from({ length: 180 }, () => ({
      angle: random() * Math.PI * 2,
      radius: 10.65 + random() * 0.75,
      y: (random() - 0.5) * 0.34,
      scale: 0.018 + random() * 0.045,
    }));
  }, []);

  useEffect(() => {
    if (!mesh.current) return;
    asteroids.forEach((asteroid, index) => {
      dummy.position.set(
        Math.cos(asteroid.angle) * asteroid.radius,
        asteroid.y,
        Math.sin(asteroid.angle) * asteroid.radius * 0.82
      );
      dummy.rotation.set(asteroid.angle, asteroid.angle * 0.7, asteroid.angle * 1.2);
      dummy.scale.setScalar(asteroid.scale);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [asteroids, dummy]);

  useFrame((_, delta) => {
    if (group.current && !reducedMotion) group.current.rotation.y += delta * 0.011;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[undefined, undefined, asteroids.length]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#605d57" roughness={1} transparent opacity={0.68} />
      </instancedMesh>
    </group>
  );
}

function SimulationClock({
  paused,
  reducedMotion,
  simulationTime,
}: {
  paused: boolean;
  reducedMotion: boolean;
  simulationTime: MutableRefObject<number>;
}) {
  useFrame((_, delta) => {
    if (!paused && !reducedMotion) simulationTime.current += Math.min(delta, 0.05);
  });
  return null;
}

const ARRIVAL_BIRD_START_ANGLE = -0.65;
const ARRIVAL_BIRD_END_ANGLE = 0.52;
const ARRIVAL_BIRD_PHASE_END = 0.38;
const ARRIVAL_FRONT_REVOLUTIONS = 1;
const ARRIVAL_ORBIT_AXIS = new THREE.Vector3(0, 1, 0);

function CameraRig({
  activeClusterId,
  reducedMotion,
  arriving,
  departing,
  onArrivalComplete,
  onInteract,
  simulationTime,
}: Pick<
  SceneProps,
  | 'activeClusterId'
  | 'reducedMotion'
  | 'arriving'
  | 'departing'
  | 'onArrivalComplete'
  | 'onInteract'
> & {
  simulationTime: MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [flying, setFlying] = useState(false);
  const [manuallyInteracted, setManuallyInteracted] = useState(false);
  const arrivalElapsed = useRef(0);
  const arrivalReported = useRef(false);
  const departureStarted = useRef(false);
  const departureElapsed = useRef(0);
  const departurePosition = useRef(new THREE.Vector3());
  const departureTarget = useRef(new THREE.Vector3());
  const arrivalPosition = useRef(new THREE.Vector3());
  const farView = useMemo(() => new THREE.Vector3(0, 32, 62), []);
  const birdViewEnd = useMemo(
    () =>
      new THREE.Vector3(
        Math.sin(ARRIVAL_BIRD_END_ANGLE) * 8,
        53,
        Math.cos(ARRIVAL_BIRD_END_ANGLE) * 8
      ),
    []
  );
  const arrivalControl = useMemo(() => new THREE.Vector3(18, 40, 20), []);
  const coreView = useMemo(() => new THREE.Vector3(0, 17.5, 32), []);
  const solarCore = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  const selectedPlanet = useMemo(() => {
    const location = activeClusterId ? CLUSTER_LOCATIONS[activeClusterId] : undefined;
    return location ? PLANETS.find((planet) => planet.id === location.planetId) ?? null : null;
  }, [activeClusterId]);

  useEffect(() => {
    setFlying(true);
    setManuallyInteracted(false);
  }, [selectedPlanet]);

  useEffect(() => {
    if (arriving) {
      arrivalElapsed.current = 0;
      arrivalReported.current = false;
    }
  }, [arriving]);

  useEffect(() => {
    if (!departing) {
      departureStarted.current = false;
      departureElapsed.current = 0;
    }
  }, [departing]);

  useFrame((_, delta) => {
    if (!controls.current) return;

    if (departing) {
      if (!departureStarted.current) {
        departureStarted.current = true;
        departureElapsed.current = 0;
        departurePosition.current.copy(camera.position);
        departureTarget.current.copy(controls.current.target);
      }
      departureElapsed.current += Math.min(delta, 0.05);
      const progress = reducedMotion
        ? 1
        : THREE.MathUtils.clamp(departureElapsed.current / 1.62, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(departurePosition.current, farView, eased);
      controls.current.target.lerpVectors(departureTarget.current, solarCore, eased);
      controls.current.update();
      return;
    }

    if (arriving) {
      arrivalElapsed.current += Math.min(delta, 0.05);
      const progress = reducedMotion
        ? 1
        : THREE.MathUtils.clamp(arrivalElapsed.current / 5.2, 0, 1);

      if (progress < ARRIVAL_BIRD_PHASE_END) {
        const birdProgress = THREE.MathUtils.smoothstep(
          progress,
          0,
          ARRIVAL_BIRD_PHASE_END
        );
        const angle = THREE.MathUtils.lerp(
          ARRIVAL_BIRD_START_ANGLE,
          ARRIVAL_BIRD_END_ANGLE,
          birdProgress
        );
        const radius = THREE.MathUtils.lerp(5, 8, birdProgress);
        camera.position.set(
          Math.sin(angle) * radius,
          THREE.MathUtils.lerp(56, 53, birdProgress),
          Math.cos(angle) * radius
        );
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = THREE.MathUtils.lerp(54, 51, birdProgress);
          camera.updateProjectionMatrix();
        }
      } else {
        const frontProgress = THREE.MathUtils.smoothstep(
          progress,
          ARRIVAL_BIRD_PHASE_END,
          1
        );
        const inverse = 1 - frontProgress;
        arrivalPosition.current.set(
          inverse * inverse * birdViewEnd.x +
            2 * inverse * frontProgress * arrivalControl.x +
            frontProgress * frontProgress * coreView.x,
          inverse * inverse * birdViewEnd.y +
            2 * inverse * frontProgress * arrivalControl.y +
            frontProgress * frontProgress * coreView.y,
          inverse * inverse * birdViewEnd.z +
            2 * inverse * frontProgress * arrivalControl.z +
            frontProgress * frontProgress * coreView.z
        );
        arrivalPosition.current.applyAxisAngle(
          ARRIVAL_ORBIT_AXIS,
          frontProgress * Math.PI * 2 * ARRIVAL_FRONT_REVOLUTIONS
        );
        camera.position.copy(arrivalPosition.current);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = THREE.MathUtils.lerp(51, 47, frontProgress);
          camera.updateProjectionMatrix();
        }
      }
      controls.current.target.copy(solarCore);
      controls.current.update();
      if (progress >= 1 && !arrivalReported.current) {
        arrivalReported.current = true;
        setFlying(false);
        onArrivalComplete();
      }
      return;
    }

    const target = selectedPlanet
      ? orbitPosition(selectedPlanet, reducedMotion ? 0 : simulationTime.current)
      : new THREE.Vector3(0, 0, 0);
    const destination = selectedPlanet
      ? target.clone().add(new THREE.Vector3(0, selectedPlanet.radius * 2.6 + 1.3, selectedPlanet.radius * 5.4 + 3.1))
      : new THREE.Vector3(0, 17.5, 32);

    if (reducedMotion) {
      camera.position.copy(destination);
      controls.current.target.copy(target);
      controls.current.update();
      setFlying(false);
      return;
    }

    if (!flying) return;
    const amount = 3.6;
    camera.position.lerp(destination, 1 - Math.exp(-amount * delta));
    controls.current.target.lerp(target, 1 - Math.exp(-amount * delta));
    controls.current.update();
    if (camera.position.distanceTo(destination) < 0.045 && controls.current.target.distanceTo(target) < 0.045) {
      setFlying(false);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!flying && !arriving && !departing}
      enableDamping
      dampingFactor={0.055}
      enablePan={false}
      minDistance={2.2}
      maxDistance={52}
      minPolarAngle={0.16}
      maxPolarAngle={Math.PI * 0.86}
      autoRotate={!reducedMotion && !manuallyInteracted && !activeClusterId && !departing}
      autoRotateSpeed={0.18}
      onStart={() => {
        setManuallyInteracted(true);
        onInteract();
      }}
    />
  );
}

function SolarSystemWorld(props: SceneProps) {
  const simulationTime = useRef(0);
  const activeLocation = props.activeClusterId
    ? CLUSTER_LOCATIONS[props.activeClusterId]
    : undefined;

  return (
    <>
      <fog attach="fog" args={['#020609', 34, 78]} />
      <ambientLight intensity={0.32} color="#a4bdce" />
      <Stars radius={72} depth={54} count={1900} factor={2.4} saturation={0.34} fade speed={0.18} />

      <SimulationClock
        paused={Boolean(props.activeClusterId) || props.departing}
        reducedMotion={props.reducedMotion}
        simulationTime={simulationTime}
      />
      <SunPortal
        finalUnlocked={props.finalUnlocked}
        reducedMotion={props.reducedMotion}
        onPortalSelect={props.onPortalSelect}
        onTempleReturn={props.onTempleReturn}
      />
      <AsteroidBelt reducedMotion={props.reducedMotion} />

      {PLANETS.map((planet) => {
        const cluster = props.dataset.clusters.find((candidate) => {
          const location = CLUSTER_LOCATIONS[candidate.id];
          return location?.planetId === planet.id && !location.moonName;
        });
        const moonClusters = new Map<string, BirthdayCluster>();
        props.dataset.clusters.forEach((candidate) => {
          const location = CLUSTER_LOCATIONS[candidate.id];
          if (location?.planetId === planet.id && location.moonName) {
            moonClusters.set(location.moonName, candidate);
          }
        });
        const systemActive = activeLocation?.planetId === planet.id;
        const planetActive = systemActive && !activeLocation?.moonName;
        return (
          <PlanetOrbit
            key={planet.id}
            planet={planet}
            cluster={cluster}
            moonClusters={moonClusters}
            planetActive={planetActive}
            systemActive={systemActive}
            activeClusterId={props.activeClusterId}
            reducedMotion={props.reducedMotion}
            simulationTime={simulationTime}
            onClusterSelect={props.onClusterSelect}
          />
        );
      })}

      <CameraRig
        activeClusterId={props.activeClusterId}
        reducedMotion={props.reducedMotion}
        arriving={props.arriving}
        departing={props.departing}
        onArrivalComplete={props.onArrivalComplete}
        onInteract={props.onInteract}
        simulationTime={simulationTime}
      />
    </>
  );
}

export default function MemoryPalaceScene(props: SceneProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return (
    <Canvas
      aria-hidden="true"
      camera={{
        position: props.arriving
          ? [
              Math.sin(ARRIVAL_BIRD_START_ANGLE) * 5,
              56,
              Math.cos(ARRIVAL_BIRD_START_ANGLE) * 5,
            ]
          : [0, 17.5, 32],
        fov: props.arriving ? 54 : 47,
        near: 0.1,
        far: 150,
      }}
      dpr={props.reducedMotion ? 1 : [1, 1.5]}
      frameloop={visible ? 'always' : 'never'}
      gl={{
        antialias: !props.reducedMotion,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.setClearColor('#020609', 0);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
      }}
    >
      <SolarSystemWorld {...props} />
    </Canvas>
  );
}
