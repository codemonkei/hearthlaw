import * as THREE from "three";
import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { Barrel, C, Door, FLAT, FACING, SELECTED, SnowBlanket, TILE_TOP, toTile } from "@/game/scene/parts";
import { SNOW_COLOR, SnowHeaps } from "@/game/scene/snow";

/*
 * The salvage post: a rusted corrugated-iron shed beside a scrap heap, with a timber derrick
 * whose chain hoists plate off the pile. Gears, a split boiler drum, pipes and a cart wheel in
 * the heap; sorted iron bars, planks and fuel barrels out front, and a lantern on a post.
 */

const SHED = { x: 0.3, z: -0.36, hw: 0.24, hd: 0.17, front: 0.38, back: 0.28 };
const PIPE: [number, number, number] = [0.42, 0.62, -0.42];
const HEAP: [number, number, number] = [-0.33, 0, -0.28];
const APEX: [number, number, number] = [HEAP[0] + 0.04, 0.95, HEAP[2] + 0.04];
const HEATER_AT: [number, number, number] = [SHED.x + 0.12, 0, SHED.z + SHED.hd + 0.08];

const LANTERN = new THREE.MeshStandardMaterial({ color: "#3a2410", emissive: "#ffb35a", emissiveIntensity: 2.2, ...FLAT });

export function salvageFlue(): [number, number, number] {
  return toTile([PIPE[0], PIPE[1] + 0.05, PIPE[2]]);
}

export function salvageHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

/** Corrugation ridges across a wall face of the given width and height, facing +z. */
function Ridges({ width, height, color }: { width: number; height: number; color: string }) {
  const n = Math.round(width / 0.035);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[-width / 2 + ((i + 0.5) / n) * width, height / 2, 0]}>
          <boxGeometry args={[0.012, height, 0.01]} />
          <meshStandardMaterial color={color} metalness={0.35} roughness={0.7} {...FLAT} />
        </mesh>
      ))}
    </>
  );
}

/** A pole from `a` to `b`. */
function Pole({ a, b, r = 0.016, color = C.logDark }: { a: [number, number, number]; b: [number, number, number]; r?: number; color?: string }) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const dir = vb.clone().sub(va);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return (
    <mesh position={mid} quaternion={q} castShadow>
      <cylinderGeometry args={[r, r * 1.15, dir.length(), 6]} />
      <meshStandardMaterial color={color} roughness={1} {...FLAT} />
    </mesh>
  );
}

function Gear({ position, rotation, r = 0.08 }: { position: [number, number, number]; rotation: [number, number, number]; r?: number }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, 0.025, 10]} />
        <meshStandardMaterial color={C.rust} metalness={0.4} roughness={0.7} {...FLAT} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * (r + 0.012), 0, Math.sin(a) * (r + 0.012)]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.026, 0.025, 0.025]} />
            <meshStandardMaterial color={C.rustDark} metalness={0.4} roughness={0.7} {...FLAT} />
          </mesh>
        );
      })}
      <mesh>
        <cylinderGeometry args={[r * 0.3, r * 0.3, 0.035, 6]} />
        <meshStandardMaterial color={C.iron} {...FLAT} />
      </mesh>
    </group>
  );
}

export function SalvagePost({ selected, heater = "none" }: { selected: boolean; heater?: HeaterState }) {
  const metal = selected ? SELECTED : "#6e4b37";
  const tilt = Math.atan((SHED.front - SHED.back) / (2 * SHED.hd));
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      {/* Corrugated shed: rusted walls, a sloped tin roof with snow, a door and a stovepipe. */}
      <group position={[SHED.x, 0, SHED.z]}>
        <mesh position={[0, SHED.back / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2 * SHED.hw, SHED.back, 2 * SHED.hd]} />
          <meshStandardMaterial color={metal} metalness={0.3} roughness={0.75} {...FLAT} />
        </mesh>
        <mesh position={[0, SHED.back + (SHED.front - SHED.back) / 2, SHED.hd - 0.01]}>
          <boxGeometry args={[2 * SHED.hw, SHED.front - SHED.back, 0.02]} />
          <meshStandardMaterial color={metal} metalness={0.3} roughness={0.75} {...FLAT} />
        </mesh>
        <group position={[0, 0, SHED.hd + 0.006]}>
          <Ridges width={2 * SHED.hw} height={SHED.front - 0.01} color={C.rustDark} />
        </group>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * (SHED.hw + 0.006), 0, 0]} rotation={[0, s * (Math.PI / 2), 0]}>
            <Ridges width={2 * SHED.hd} height={SHED.back} color={C.rustDark} />
          </group>
        ))}
        <group position={[0, (SHED.front + SHED.back) / 2 + 0.015, 0]} rotation={[-tilt, 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2 * SHED.hw + 0.1, 0.02, 2 * SHED.hd + 0.12]} />
            <meshStandardMaterial color="#59595a" metalness={0.45} roughness={0.6} {...FLAT} />
          </mesh>
          <SnowBlanket width={2 * SHED.hw + 0.1} depth={2 * SHED.hd + 0.12} phase={0.9} position={[0, 0.011, 0]} rotationY={Math.PI} />
        </group>
        <Door position={[-0.08, 0, SHED.hd + 0.012]} width={0.16} height={0.28} />
      </group>
      <group position={[PIPE[0], 0, PIPE[2]]}>
        <mesh position={[0, (0.3 + PIPE[1]) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, PIPE[1] - 0.3, 6]} />
          <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
        </mesh>
        <mesh position={[0, PIPE[1] + 0.02, 0]}>
          <coneGeometry args={[0.045, 0.04, 6]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
      </group>

      {/* The scrap heap. */}
      <group position={HEAP}>
        <mesh position={[0, 0.04, 0]} scale={[1.2, 0.42, 1]} castShadow receiveShadow>
          <icosahedronGeometry args={[0.28, 1]} />
          <meshStandardMaterial color="#4a4038" roughness={1} {...FLAT} />
        </mesh>
        {[
          [0.08, 0.13, 0.05, 0.4, 0.3, 0.2, "#8a5a3c"],
          [-0.14, 0.1, -0.06, -0.3, 1.1, 0.5, "#6e4a35"],
          [0.02, 0.15, -0.14, 0.7, 0.4, -0.2, "#a0683f"],
          [-0.05, 0.12, 0.16, -0.2, 2.2, 0.35, "#5b5f63"],
        ].map(([x, y, z, rx, ry, rz, color], i) => (
          <mesh key={i} position={[x as number, y as number, z as number]} rotation={[rx as number, ry as number, rz as number]} castShadow>
            <boxGeometry args={[0.18, 0.012, 0.13]} />
            <meshStandardMaterial color={color as string} metalness={0.35} roughness={0.75} {...FLAT} />
          </mesh>
        ))}
        {/* Split boiler drum on its side. */}
        <mesh position={[0.2, 0.09, 0.1]} rotation={[0, 0.5, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.26, 9, 1, true, 0, Math.PI * 1.4]} />
          <meshStandardMaterial color={C.rust} metalness={0.4} roughness={0.7} side={2} {...FLAT} />
        </mesh>
        <Gear position={[-0.12, 0.16, 0.08]} rotation={[1.1, 0, 0.3]} />
        <Gear position={[0.12, 0.2, -0.08]} rotation={[0.4, 0, -0.9]} r={0.055} />
        <mesh position={[-0.2, 0.08, -0.14]} rotation={[0.2, 0.6, Math.PI / 2 - 0.2]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.34, 6]} />
          <meshStandardMaterial color="#5b5f63" metalness={0.5} roughness={0.6} {...FLAT} />
        </mesh>
        <mesh position={[0.26, 0.07, -0.16]} rotation={[0.3, 0.8, 1.3]}>
          <torusGeometry args={[0.07, 0.012, 5, 10]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
        {[
          [-0.06, 0.2, -0.02, 0.07],
          [0.16, 0.17, 0.02, 0.05],
          [-0.22, 0.1, 0.12, 0.06],
        ].map(([x, y, z, r], i) => (
          <mesh key={`s${i}`} position={[x!, y!, z!]} scale={[1.3, 0.55, 1.1]} rotation={[0, i, 0]}>
            <icosahedronGeometry args={[r!, 1]} />
            <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
          </mesh>
        ))}
      </group>

      {/* Timber derrick over the heap, hoisting a plate on a chain. */}
      <Pole a={[HEAP[0] - 0.36, 0, HEAP[2] + 0.2]} b={APEX} />
      <Pole a={[HEAP[0] + 0.3, 0, HEAP[2] + 0.28]} b={APEX} />
      <Pole a={[HEAP[0] + 0.02, 0, HEAP[2] - 0.38]} b={APEX} />
      <mesh position={[APEX[0], APEX[1] - 0.03, APEX[2]]} rotation={[0, 0.7, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 8]} />
        <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
      </mesh>
      <mesh position={[APEX[0], APEX[1] - 0.26, APEX[2]]}>
        <cylinderGeometry args={[0.004, 0.004, 0.44, 4]} />
        <meshStandardMaterial color="#1f2326" metalness={0.6} roughness={0.5} {...FLAT} />
      </mesh>
      <mesh position={[APEX[0], APEX[1] - 0.5, APEX[2]]} rotation={[0, 0.5, 0.15]} castShadow>
        <boxGeometry args={[0.14, 0.012, 0.11]} />
        <meshStandardMaterial color={C.rust} metalness={0.4} roughness={0.7} {...FLAT} />
      </mesh>

      {/* Sorted salvage out front: iron bars, planks, fuel barrels. */}
      <group position={[0.36, 0, 0.22]} rotation={[0, 0.4, 0]}>
        {[0, 1, 2].flatMap((row) =>
          Array.from({ length: 4 - row }, (_, i) => (
            <mesh key={`${row}${i}`} position={[0, 0.012 + row * 0.022, (i - (3 - row) / 2) * 0.03]} castShadow>
              <boxGeometry args={[0.3, 0.02, 0.022]} />
              <meshStandardMaterial color={row % 2 ? "#5b5f63" : "#4a4e52"} metalness={0.55} roughness={0.5} {...FLAT} />
            </mesh>
          )),
        )}
      </group>
      <group position={[0.02, 0, 0.5]} rotation={[0, -0.3, 0]}>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} position={[0, 0.01 + k * 0.02, 0]} rotation={[0, k * 0.08, 0]} castShadow>
            <boxGeometry args={[0.32, 0.018, 0.12]} />
            <meshStandardMaterial color={k % 2 ? C.plank : C.logEnd} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <SnowBlanket width={0.3} depth={0.12} phase={3.3} position={[0.01, 0.07, 0]} />
      </group>
      <Barrel position={[0.6, 0, -0.02]} color="#2b2f33" band="#8a2a1c" />
      <Barrel position={[0.62, 0, 0.12]} color="#2b2f33" band="#8a2a1c" />
      <mesh position={[0.5, 0.05, 0.36]} rotation={[0, 0.6, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.14, 8]} />
        <meshStandardMaterial color="#2b2f33" roughness={0.9} {...FLAT} />
      </mesh>

      {/* Lantern on a post. */}
      <group position={[-0.24, 0, 0.3]}>
        <mesh position={[0, 0.24, 0]} castShadow>
          <boxGeometry args={[0.03, 0.48, 0.03]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0.05, 0.46, 0]}>
          <boxGeometry args={[0.1, 0.015, 0.015]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
        <mesh position={[0.09, 0.41, 0]} material={LANTERN}>
          <boxGeometry args={[0.04, 0.05, 0.04]} />
        </mesh>
        <mesh position={[0.09, 0.445, 0]}>
          <coneGeometry args={[0.035, 0.03, 4]} />
          <meshStandardMaterial color={C.iron} {...FLAT} />
        </mesh>
      </group>

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [-0.6, 0.15, 0.1],
          [0.58, -0.45, 0.1],
          [-0.05, -0.62, 0.11],
        ]}
      />
    </group>
  );
}
