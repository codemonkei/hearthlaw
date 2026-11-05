import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Embers } from "@/game/scene/Atmosphere";

/*
 * The Kiln: a buried pre-collapse thermal engine that still breathes.
 * A riveted iron drum half-sunk in a stone foundation, fire showing through barred grates,
 * a banded smokestack, and copper heat pipes running down into the ice.
 *
 * Local units: y = 0 is the slab centre of the Kiln's tile (the tile top is y = 0.1).
 * Reads its state from props each frame: pressure (how hot), surge (white-hot), strain
 * (the iron itself starts to glow red), running (banked when false).
 */

/** Height of the smokestack mouth above the group origin: embers and smoke start here. */
export const KILN_STACK_TOP = 3.35;

const TILE_TOP = 0.1;
const FLAT = { flatShading: true } as const;

const STONE = "#596068";
const IRON = "#2b3239";
const IRON_LIGHT = "#3c454e";
const COPPER = "#9a5430";
const SNOW = "#dde5ec";
const ICE = "#c7dce8";

const DRUM_R = 0.95;
const DRUM_BOTTOM = TILE_TOP + 0.32;
const DRUM_TOP = DRUM_BOTTOM + 0.98;
const GRATE_Y = DRUM_BOTTOM + 0.42;

/** Where the heat pipes leave the drum, and where the grates sit between them. */
const PIPE_ANGLES = [0, 1, 2, 3].map((i) => (i / 4) * Math.PI * 2);
const GRATE_ANGLES = PIPE_ANGLES.map((a) => a + Math.PI / 4);

function lathe(points: [number, number][], segments: number) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/** A copper heat pipe: out of the drum, over an elbow, and down into the ground. */
function pipeGeometry() {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(DRUM_R - 0.05, GRATE_Y + 0.3, 0),
    new THREE.Vector3(DRUM_R + 0.16, GRATE_Y + 0.3, 0),
    new THREE.Vector3(DRUM_R + 0.25, GRATE_Y + 0.12, 0),
    new THREE.Vector3(DRUM_R + 0.26, TILE_TOP + 0.2, 0),
  ]);
  return new THREE.TubeGeometry(path, 16, 0.075, 7, false);
}

export function Kiln({
  strain,
  pressure,
  surge,
  running,
}: {
  strain: number;
  pressure: number;
  surge: boolean;
  running: boolean;
}) {
  const light = useRef<THREE.PointLight>(null);
  const mats = useMemo(
    () => ({
      grate: new THREE.MeshStandardMaterial({ color: "#2a0d05", emissive: "#ff7a2a", emissiveIntensity: 2, ...FLAT }),
      mouth: new THREE.MeshStandardMaterial({ color: "#2a0d05", emissive: "#ffb15c", emissiveIntensity: 3, side: THREE.DoubleSide }),
      iron: new THREE.MeshStandardMaterial({ color: IRON, metalness: 0.5, roughness: 0.55, emissive: "#ff3a12", emissiveIntensity: 0, ...FLAT }),
    }),
    [],
  );
  const geo = useMemo(
    () => ({
      shoulder: lathe(
        [
          [DRUM_R - 0.02, 0],
          [DRUM_R - 0.06, 0.18],
          [0.8, 0.38],
          [0.6, 0.55],
          [0.42, 0.66],
        ],
        14,
      ),
      flare: lathe(
        [
          [0.24, 0],
          [0.27, 0.08],
          [0.36, 0.2],
          [0.38, 0.24],
          [0.3, 0.24],
          [0.24, 0.12],
        ],
        12,
      ),
      pipe: pipeGeometry(),
    }),
    [],
  );
  const whiteHot = useMemo(() => new THREE.Color("#ffd8a8"), []);
  const fire = useMemo(() => new THREE.Color("#ff7a2a"), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const s = Math.min(1, strain / 1000);
    // Fire breathes faster as strain rises.
    const breath = Math.sin(t * (1.6 + s * 6)) * 0.5 + 0.5;
    const flicker = Math.sin(t * 13.1) * 0.06 + Math.sin(t * 7.3) * 0.05;
    const heat = running ? 1.2 + pressure * 0.6 + (surge ? 1.4 : 0) : 0.08;
    mats.grate.emissiveIntensity = heat * (0.85 + breath * 0.2 + flicker);
    mats.grate.emissive.copy(fire).lerp(whiteHot, surge ? 0.6 : 0);
    mats.mouth.emissiveIntensity = running ? heat * 0.7 : 0.1;
    // Strain: the iron itself glows, pulsing as the vessel labours.
    mats.iron.emissiveIntensity = s * s * (0.25 + breath * 0.55);
    if (light.current) light.current.intensity = running ? heat * (4 + breath * 0.8) : 0.4;
  });

  return (
    <group>
      {/* Foundation: octagonal stone plinth, buttresses, a snow lip, ice at the foot. */}
      <mesh position={[0, TILE_TOP + 0.16, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.38, 1.5, 0.32, 8]} />
        <meshStandardMaterial color={STONE} roughness={0.95} {...FLAT} />
      </mesh>
      <mesh position={[0, TILE_TOP + 0.33, 0]} receiveShadow>
        <cylinderGeometry args={[1.36, 1.38, 0.035, 8]} />
        <meshStandardMaterial color={SNOW} roughness={0.9} {...FLAT} />
      </mesh>
      {PIPE_ANGLES.map((a, i) => (
        <mesh
          key={`buttress-${i}`}
          position={[Math.sin(a) * 1.18, TILE_TOP + 0.38, Math.cos(a) * 1.18]}
          rotation={[0, a, 0]}
          castShadow
        >
          <boxGeometry args={[0.3, 0.22, 0.34]} />
          <meshStandardMaterial color={STONE} roughness={0.95} {...FLAT} />
        </mesh>
      ))}
      {[0.3, 1.2, 2.1, 2.9, 3.8, 4.7, 5.6].map((a, i) => (
        <mesh
          key={`ice-${i}`}
          position={[Math.sin(a) * (1.48 + (i % 3) * 0.07), TILE_TOP + 0.05, Math.cos(a) * (1.48 + (i % 3) * 0.07)]}
          rotation={[i * 0.7, a, i * 0.3]}
          scale={[1, 0.6, 1]}
          castShadow
        >
          <icosahedronGeometry args={[0.13 + (i % 3) * 0.05, 0]} />
          <meshStandardMaterial color={ICE} roughness={0.35} {...FLAT} />
        </mesh>
      ))}

      {/* The drum: riveted iron, ribbed, banded. */}
      <mesh position={[0, (DRUM_BOTTOM + DRUM_TOP) / 2, 0]} material={mats.iron} castShadow receiveShadow>
        <cylinderGeometry args={[DRUM_R - 0.03, DRUM_R, DRUM_TOP - DRUM_BOTTOM, 16]} />
      </mesh>
      {/* Ribs everywhere except where the grates are cut into the drum. */}
      {Array.from({ length: 16 }, (_, i) => i).filter((i) => i % 4 !== 2).map((i) => (i / 16) * Math.PI * 2).map((a, i) => (
        <mesh key={`rib-${i}`} position={[Math.sin(a) * DRUM_R, (DRUM_BOTTOM + DRUM_TOP) / 2, Math.cos(a) * DRUM_R]} rotation={[0, a, 0]} castShadow>
          <boxGeometry args={[0.06, DRUM_TOP - DRUM_BOTTOM, 0.06]} />
          <meshStandardMaterial color={IRON_LIGHT} metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
      ))}
      {[DRUM_BOTTOM + 0.05, DRUM_TOP - 0.05].map((y) => (
        <mesh key={`band-${y}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[DRUM_R + 0.02, 0.045, 6, 24]} />
          <meshStandardMaterial color={IRON_LIGHT} metalness={0.55} roughness={0.45} {...FLAT} />
        </mesh>
      ))}

      {/* Fire grates: where you see the Kiln breathe. */}
      {GRATE_ANGLES.map((a, i) => (
        <group key={`grate-${i}`} position={[Math.sin(a) * (DRUM_R + 0.01), GRATE_Y, Math.cos(a) * (DRUM_R + 0.01)]} rotation={[0, a, 0]}>
          <mesh position={[0, 0, 0.01]}>
            <boxGeometry args={[0.46, 0.34, 0.05]} />
            <meshStandardMaterial color={IRON_LIGHT} metalness={0.5} roughness={0.5} {...FLAT} />
          </mesh>
          <mesh position={[0, 0, 0.04]} material={mats.grate}>
            <planeGeometry args={[0.36, 0.24]} />
          </mesh>
          {[-0.12, -0.04, 0.04, 0.12].map((x) => (
            <mesh key={x} position={[x, 0, 0.06]}>
              <boxGeometry args={[0.025, 0.26, 0.025]} />
              <meshStandardMaterial color="#161a1e" {...FLAT} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Shoulder: the iron dome with a copper pressure collar. */}
      <mesh geometry={geo.shoulder} position={[0, DRUM_TOP, 0]} material={mats.iron} castShadow />
      <mesh position={[0, DRUM_TOP + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[DRUM_R - 0.01, 0.065, 6, 24]} />
        <meshStandardMaterial color={COPPER} metalness={0.6} roughness={0.35} {...FLAT} />
      </mesh>

      {/* The stack: banded, flared, glowing at the mouth. */}
      <mesh position={[0, (DRUM_TOP + 0.55 + KILN_STACK_TOP - 0.24) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.32, KILN_STACK_TOP - 0.24 - (DRUM_TOP + 0.55), 10]} />
        <meshStandardMaterial color={IRON} metalness={0.5} roughness={0.5} {...FLAT} />
      </mesh>
      {[DRUM_TOP + 0.85, DRUM_TOP + 1.25, DRUM_TOP + 1.6].map((y, i) => (
        <mesh key={`stackband-${y}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.31 - i * 0.025, 0.03, 6, 16]} />
          <meshStandardMaterial color={COPPER} metalness={0.6} roughness={0.35} {...FLAT} />
        </mesh>
      ))}
      <mesh geometry={geo.flare} position={[0, KILN_STACK_TOP - 0.24, 0]} castShadow>
        <meshStandardMaterial color={COPPER} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} {...FLAT} />
      </mesh>
      <mesh position={[0, KILN_STACK_TOP - 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.mouth}>
        <circleGeometry args={[0.24, 12]} />
      </mesh>

      {/* Heat pipes: out of the drum and down into the ice. */}
      {PIPE_ANGLES.map((a, i) => (
        <group key={`pipe-${i}`} rotation={[0, a + Math.PI / 2, 0]}>
          <mesh geometry={geo.pipe} castShadow>
            <meshStandardMaterial color={COPPER} metalness={0.6} roughness={0.38} {...FLAT} />
          </mesh>
          <mesh position={[DRUM_R + 0.04, GRATE_Y + 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.12, 0.06, 8]} />
            <meshStandardMaterial color={IRON_LIGHT} metalness={0.5} roughness={0.5} {...FLAT} />
          </mesh>
        </group>
      ))}

      {/* Front: a pressure gauge and a valve wheel, facing the camera's side. */}
      <group rotation={[0, Math.PI / 4, 0]}>
        <mesh position={[0, DRUM_TOP - 0.18, DRUM_R + 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.05, 12]} />
          <meshStandardMaterial color={COPPER} metalness={0.6} roughness={0.35} {...FLAT} />
        </mesh>
        <mesh position={[0, DRUM_TOP - 0.18, DRUM_R + 0.07]}>
          <circleGeometry args={[0.1, 12]} />
          <meshStandardMaterial color="#e9e2cf" roughness={0.6} />
        </mesh>
        <mesh position={[0.03, DRUM_TOP - 0.16, DRUM_R + 0.075]} rotation={[0, 0, -0.9 + Math.min(1, strain / 1000) * 1.8]}>
          <boxGeometry args={[0.012, 0.09, 0.01]} />
          <meshStandardMaterial color="#8a1c10" />
        </mesh>
      </group>
      <group rotation={[0, Math.PI / 4 + 0.55, 0]}>
        <mesh position={[0, GRATE_Y - 0.02, DRUM_R + 0.1]}>
          <torusGeometry args={[0.13, 0.022, 6, 14]} />
          <meshStandardMaterial color="#7e2a1a" metalness={0.5} roughness={0.4} {...FLAT} />
        </mesh>
        <mesh position={[0, GRATE_Y - 0.02, DRUM_R + 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.1, 6]} />
          <meshStandardMaterial color={IRON_LIGHT} {...FLAT} />
        </mesh>
      </group>

      <pointLight ref={light} position={[0, GRATE_Y + 0.2, 0]} color="#ff9a3c" distance={18} decay={2} />
      <Embers origin={[0, KILN_STACK_TOP, 0]} strength={running ? 0.45 + pressure * 0.18 + (surge ? 0.3 : 0) : 0} />
    </group>
  );
}
