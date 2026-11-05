import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Embers } from "@/game/scene/Atmosphere";

/*
 * The Kiln hall: the buried thermal engine, housed. An octagonal stone engine house on a
 * plinth, a steep iron roof with a glowing ventilator lantern, a smokestack through the roof,
 * fire showing through the great doorway and the window slits, copper heat pipes leaving
 * through the walls into the ground, a lean-to fuel store at the back and peat by the door.
 *
 * Local units: y = 0 is the slab centre of the Kiln's tile (the tile top is y = 0.1).
 * Reads its state from props each frame: pressure (how hot), surge (white-hot), strain
 * (the iron roof and stack start to glow red), running (banked when false).
 *
 * Earlier looks are kept as git tags (kiln-v1 …) so any of them can be restored.
 */

/** Height of the smokestack mouth above the group origin: embers and smoke start here. */
export const KILN_STACK_TOP = 3.6;

const TILE_TOP = 0.1;
const FLAT = { flatShading: true } as const;

const STONE = "#5b6169";
const STONE_DARK = "#474c53";
const IRON = "#2b3239";
const IRON_LIGHT = "#3c454e";
const COPPER = "#9a5430";
const TIMBER = "#4a3327";
const PEAT = "#2e2620";
const SNOW = "#dde5ec";
const ICE = "#c7dce8";

const PLINTH_TOP = TILE_TOP + 0.32;
/** Octagon apothem of the engine house walls, and their height. */
const A = 0.9;
const CIRCUM = A / Math.cos(Math.PI / 8);
const WALL_H = 1.05;
const WALL_TOP = PLINTH_TOP + WALL_H;
const SIDE = 2 * A * Math.tan(Math.PI / 8);
const ROOF_H = 0.78;
const ROOF_TOP = WALL_TOP + 0.08 + ROOF_H;
const LANTERN_H = 0.26;

const FRONT = Math.PI / 4;
/** Wall faces, by the angle of their outward normal. The front holds the door. */
const FACES = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
const near = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.01;
const BACK = FRONT + Math.PI;
const WINDOW_FACES = FACES.filter((a) => !near(a, FRONT) && !near(a, BACK));
const PIPE_FACES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

const at = (a: number, r: number, y: number): [number, number, number] => [Math.sin(a) * r, y, Math.cos(a) * r];

function lathe(points: [number, number][], segments: number) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/** A copper heat pipe: out through the wall and down into the plinth. */
function pipeGeometry() {
  const y = PLINTH_TOP + 0.38;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(A - 0.05, y, 0),
    new THREE.Vector3(A + 0.2, y, 0),
    new THREE.Vector3(A + 0.3, y - 0.18, 0),
    new THREE.Vector3(A + 0.31, PLINTH_TOP - 0.05, 0),
  ]);
  return new THREE.TubeGeometry(path, 14, 0.07, 7, false);
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
      fire: new THREE.MeshStandardMaterial({ color: "#2a0d05", emissive: "#ff7a2a", emissiveIntensity: 2, side: THREE.DoubleSide }),
      mouth: new THREE.MeshStandardMaterial({ color: "#2a0d05", emissive: "#ffb15c", emissiveIntensity: 2, side: THREE.DoubleSide }),
      iron: new THREE.MeshStandardMaterial({ color: IRON, metalness: 0.45, roughness: 0.6, emissive: "#ff3a12", emissiveIntensity: 0, ...FLAT }),
      stone: new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.95, ...FLAT }),
      stoneDark: new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 0.95, ...FLAT }),
      copper: new THREE.MeshStandardMaterial({ color: COPPER, metalness: 0.6, roughness: 0.38, ...FLAT }),
      ironLight: new THREE.MeshStandardMaterial({ color: IRON_LIGHT, metalness: 0.5, roughness: 0.5, ...FLAT }),
    }),
    [],
  );
  const geo = useMemo(
    () => ({
      flare: lathe(
        [
          [0.22, 0],
          [0.25, 0.08],
          [0.34, 0.2],
          [0.36, 0.24],
          [0.28, 0.24],
          [0.22, 0.12],
        ],
        12,
      ),
      pipe: pipeGeometry(),
    }),
    [],
  );
  const whiteHot = useMemo(() => new THREE.Color("#ffd8a8"), []);
  const flame = useMemo(() => new THREE.Color("#ff7a2a"), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const s = Math.min(1, strain / 1000);
    // The fire breathes faster as strain rises.
    const breath = Math.sin(t * (1.6 + s * 6)) * 0.5 + 0.5;
    const flicker = Math.sin(t * 13.1) * 0.06 + Math.sin(t * 7.3) * 0.05;
    const heat = running ? 1.2 + pressure * 0.6 + (surge ? 1.4 : 0) : 0.08;
    mats.fire.emissiveIntensity = heat * (0.85 + breath * 0.2 + flicker);
    mats.fire.emissive.copy(flame).lerp(whiteHot, surge ? 0.6 : 0);
    mats.mouth.emissiveIntensity = running ? heat * 0.7 : 0.1;
    // Strain: the iron roof and stack glow, pulsing as the vessel labours.
    mats.iron.emissiveIntensity = s * s * (0.25 + breath * 0.55);
    if (light.current) light.current.intensity = running ? heat * (4 + breath * 0.8) : 0.4;
  });

  const stackBase = ROOF_TOP + LANTERN_H + 0.12;

  return (
    <group>
      {/* Plinth: octagonal stone, a snow lip, ice at the foot. */}
      <mesh position={[0, TILE_TOP + 0.16, 0]} rotation={[0, Math.PI / 8, 0]} material={mats.stoneDark} castShadow receiveShadow>
        <cylinderGeometry args={[1.38, 1.5, 0.32, 8]} />
      </mesh>
      <mesh position={[0, PLINTH_TOP + 0.005, 0]} rotation={[0, Math.PI / 8, 0]} receiveShadow>
        <cylinderGeometry args={[1.36, 1.38, 0.03, 8]} />
        <meshStandardMaterial color={SNOW} roughness={0.9} {...FLAT} />
      </mesh>
      {[0.3, 1.2, 2.1, 2.9, 3.8, 4.7, 5.6].map((a, i) => (
        <mesh key={`ice-${i}`} position={at(a, 1.48 + (i % 3) * 0.07, TILE_TOP + 0.05)} rotation={[i * 0.7, a, i * 0.3]} scale={[1, 0.6, 1]} castShadow>
          <icosahedronGeometry args={[0.13 + (i % 3) * 0.05, 0]} />
          <meshStandardMaterial color={ICE} roughness={0.35} {...FLAT} />
        </mesh>
      ))}

      {/* Engine house: eight stone walls, the front one a great doorway. */}
      {WINDOW_FACES.concat(BACK).map((a) => (
        <mesh key={`wall-${a}`} position={at(a, A, PLINTH_TOP + WALL_H / 2)} rotation={[0, a, 0]} material={mats.stone} castShadow receiveShadow>
          <boxGeometry args={[SIDE + 0.02, WALL_H, 0.14]} />
        </mesh>
      ))}
      <group position={at(FRONT, A, PLINTH_TOP)} rotation={[0, FRONT, 0]}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (SIDE / 2 - 0.1), WALL_H / 2, 0]} material={mats.stone} castShadow>
            <boxGeometry args={[0.2, WALL_H, 0.14]} />
          </mesh>
        ))}
        <mesh position={[0, WALL_H - 0.16, 0]} material={mats.stone} castShadow>
          <boxGeometry args={[SIDE + 0.02, 0.32, 0.14]} />
        </mesh>
        <mesh position={[0, WALL_H - 0.33, 0.06]} material={mats.ironLight}>
          <boxGeometry args={[SIDE - 0.3, 0.05, 0.06]} />
        </mesh>
        {/* The furnace glow, deep inside the doorway. */}
        <mesh position={[0, (WALL_H - 0.32) / 2, -0.12]} material={mats.fire}>
          <planeGeometry args={[SIDE - 0.4, WALL_H - 0.32]} />
        </mesh>
        <mesh position={[0, 0.02, 0.08]} material={mats.stoneDark} receiveShadow>
          <boxGeometry args={[SIDE - 0.3, 0.04, 0.22]} />
        </mesh>
      </group>

      {/* Window slits, lit by the fire. */}
      {WINDOW_FACES.map((a) => (
        <group key={`win-${a}`} position={at(a, A + 0.075, PLINTH_TOP + WALL_H * 0.55)} rotation={[0, a, 0]}>
          <mesh position={[0, 0, 0.002]} material={mats.ironLight}>
            <boxGeometry args={[0.2, 0.46, 0.02]} />
          </mesh>
          <mesh position={[0, 0, 0.014]} material={mats.fire}>
            <planeGeometry args={[0.13, 0.38]} />
          </mesh>
          <mesh position={[0, 0, 0.02]} material={mats.ironLight}>
            <boxGeometry args={[0.02, 0.38, 0.02]} />
          </mesh>
        </group>
      ))}

      {/* Corner piers and a stone cornice under the roof. */}
      {FACES.map((a) => a + Math.PI / 8).map((a) => (
        <mesh key={`pier-${a}`} position={at(a, CIRCUM, PLINTH_TOP + (WALL_H + 0.06) / 2)} rotation={[0, a, 0]} material={mats.stoneDark} castShadow>
          <boxGeometry args={[0.2, WALL_H + 0.06, 0.2]} />
        </mesh>
      ))}
      <mesh position={[0, WALL_TOP + 0.04, 0]} rotation={[0, Math.PI / 8, 0]} material={mats.stoneDark} castShadow>
        <cylinderGeometry args={[CIRCUM + 0.1, CIRCUM + 0.08, 0.08, 8]} />
      </mesh>

      {/* Roof: steep iron, with a ventilator lantern glowing at its crown. */}
      <mesh position={[0, WALL_TOP + 0.08 + ROOF_H / 2, 0]} rotation={[0, Math.PI / 8, 0]} material={mats.iron} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, CIRCUM + 0.22, ROOF_H, 8]} />
      </mesh>
      <mesh position={[0, ROOF_TOP + LANTERN_H / 2, 0]} rotation={[0, Math.PI / 8, 0]} material={mats.fire}>
        <cylinderGeometry args={[0.3, 0.3, LANTERN_H, 8, 1, true]} />
      </mesh>
      {FACES.map((a) => a + Math.PI / 8).map((a) => (
        <mesh key={`louvre-${a}`} position={at(a, 0.31, ROOF_TOP + LANTERN_H / 2)} rotation={[0, a, 0]} material={mats.ironLight}>
          <boxGeometry args={[0.05, LANTERN_H, 0.05]} />
        </mesh>
      ))}
      <mesh position={[0, ROOF_TOP + LANTERN_H + 0.06, 0]} rotation={[0, Math.PI / 8, 0]} material={mats.iron} castShadow>
        <cylinderGeometry args={[0.24, 0.42, 0.12, 8]} />
      </mesh>

      {/* The stack: through the lantern, banded, flared, glowing at the mouth. */}
      <mesh position={[0, (stackBase + KILN_STACK_TOP - 0.24) / 2, 0]} material={mats.iron} castShadow>
        <cylinderGeometry args={[0.2, 0.26, KILN_STACK_TOP - 0.24 - stackBase, 10]} />
      </mesh>
      {[stackBase + 0.25, stackBase + 0.6].map((y, i) => (
        <mesh key={`band-${y}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper}>
          <torusGeometry args={[0.25 - i * 0.02, 0.03, 6, 16]} />
        </mesh>
      ))}
      <mesh geometry={geo.flare} position={[0, KILN_STACK_TOP - 0.24, 0]} material={mats.copper} castShadow />
      <mesh position={[0, KILN_STACK_TOP - 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.mouth}>
        <circleGeometry args={[0.22, 12]} />
      </mesh>

      {/* Heat pipes: out through the walls, down into the plinth. */}
      {PIPE_FACES.map((a) => (
        <group key={`pipe-${a}`} rotation={[0, a - Math.PI / 2, 0]}>
          <mesh geometry={geo.pipe} material={mats.copper} castShadow />
          <mesh position={[A + 0.08, PLINTH_TOP + 0.38, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.ironLight}>
            <cylinderGeometry args={[0.11, 0.11, 0.05, 8]} />
          </mesh>
        </group>
      ))}

      {/* Lean-to fuel store against the back wall. */}
      <group position={at(BACK, A + 0.28, PLINTH_TOP)} rotation={[0, BACK, 0]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[0.7, 0.56, 0.4]} />
          <meshStandardMaterial color={TIMBER} roughness={0.95} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.62, 0.02]} rotation={[0.45, 0, 0]} material={mats.ironLight} castShadow>
          <boxGeometry args={[0.8, 0.05, 0.56]} />
        </mesh>
      </group>

      {/* Peat bricks stacked by the door. */}
      <group position={at(FRONT + 0.62, A + 0.32, PLINTH_TOP)} rotation={[0, FRONT + 0.3, 0]}>
        {[
          [-0.1, 0.05, 0],
          [0.1, 0.05, 0],
          [0, 0.05, 0.16],
          [0, 0.15, 0.06],
          [-0.09, 0.15, 0.1],
        ].map(([x, y, z], i) => (
          <mesh key={i} position={[x!, y!, z!]} rotation={[0, i * 0.4, 0]} castShadow>
            <boxGeometry args={[0.17, 0.09, 0.11]} />
            <meshStandardMaterial color={PEAT} roughness={1} {...FLAT} />
          </mesh>
        ))}
      </group>

      {/* Beside the door: a pressure gauge and a valve wheel. */}
      <group position={at(FRONT - Math.PI / 4, A + 0.08, 0)} rotation={[0, FRONT - Math.PI / 4, 0]}>
        <mesh position={[0.12, PLINTH_TOP + 0.75, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper}>
          <cylinderGeometry args={[0.12, 0.12, 0.05, 12]} />
        </mesh>
        <mesh position={[0.12, PLINTH_TOP + 0.75, 0.03]}>
          <circleGeometry args={[0.09, 12]} />
          <meshStandardMaterial color="#e9e2cf" roughness={0.6} />
        </mesh>
        <mesh position={[0.12, PLINTH_TOP + 0.77, 0.035]} rotation={[0, 0, -0.9 + Math.min(1, strain / 1000) * 1.8]}>
          <boxGeometry args={[0.012, 0.08, 0.01]} />
          <meshStandardMaterial color="#8a1c10" />
        </mesh>
        <mesh position={[-0.12, PLINTH_TOP + 0.38, 0.06]}>
          <torusGeometry args={[0.12, 0.022, 6, 14]} />
          <meshStandardMaterial color="#7e2a1a" metalness={0.5} roughness={0.4} {...FLAT} />
        </mesh>
      </group>

      <pointLight ref={light} position={at(FRONT, A + 0.4, PLINTH_TOP + 0.5)} color="#ff9a3c" distance={14} decay={2} />
      <Embers origin={[0, KILN_STACK_TOP, 0]} strength={running ? 0.45 + pressure * 0.18 + (surge ? 0.3 : 0) : 0} />
    </group>
  );
}
