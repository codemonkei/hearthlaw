import * as THREE from "three";
import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { C, Embers, FLAT, FACING, SELECTED, SnowBlanket, TILE_TOP, toTile } from "@/game/scene/parts";
import { SNOW_COLOR, SnowHeaps } from "@/game/scene/snow";

/*
 * The peat cutter: a working yard on the seam. A stepped peat bank cut back in dark terraces
 * with spades left in it, ricks of peat bricks stacked crosswise to dry, an open drying shed
 * stacked full, a loaded wheelbarrow, and an iron brazier where the cutters warm their hands.
 */

const FRESH_CUT = "#4a3727";
const BRICK = new THREE.BoxGeometry(0.11, 0.042, 0.045);
const BRICK_MAT = [
  new THREE.MeshStandardMaterial({ color: "#5c4431", roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: "#4a3727", roughness: 1, flatShading: true }),
];

const BRAZIER: [number, number, number] = [0.42, 0, -0.04];
const HEATER_AT: [number, number, number] = [-0.05, 0, 0.12];

export function peatFlue(): [number, number, number] {
  return toTile([BRAZIER[0], 0.3, BRAZIER[2]]);
}

export function peatHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, 0);
  return toTile([p.x, p.y, p.z]);
}

/** Peat bricks stacked crosswise to dry, shrinking toward the top, with snow on the cap. */
function PeatRick({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const counts = [3, 3, 2, 2, 1];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {counts.map((n, k) =>
        Array.from({ length: n }, (_, i) => {
          const off = (i - (n - 1) / 2) * 0.052;
          const along = k % 2 === 0;
          return (
            <mesh
              key={`${k}-${i}`}
              geometry={BRICK}
              material={BRICK_MAT[(i + k) % 2]}
              position={[along ? 0 : off, 0.021 + k * 0.042, along ? off : 0]}
              rotation={[0, along ? 0 : Math.PI / 2, 0]}
              castShadow
            />
          );
        }),
      )}
      <mesh position={[0, 0.222, 0]} scale={[1.3, 0.55, 1.1]}>
        <icosahedronGeometry args={[0.035, 0]} />
        <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
      </mesh>
    </group>
  );
}

/** One terrace of the cut bank: dark cut face toward +z, snow lumps on the uncut top. */
function Tier({ z, depth, height, width, x = 0, snow }: { z: number; depth: number; height: number; width: number; x?: number; snow: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={FRESH_CUT} roughness={1} {...FLAT} />
      </mesh>
      {Array.from({ length: Math.max(1, Math.round(height / 0.05)) }, (_, i) => (
        <mesh key={i} position={[0, 0.025 + i * 0.05, depth / 2 + 0.002]}>
          <boxGeometry args={[width, 0.006, 0.004]} />
          <meshStandardMaterial color={C.peatDark} roughness={1} {...FLAT} />
        </mesh>
      ))}
      <SnowBlanket width={width} depth={depth} phase={snow} position={[0, height + 0.002, 0]} />
    </group>
  );
}

function Spade({ position, lean }: { position: [number, number, number]; lean: number }) {
  return (
    <group position={position} rotation={[lean, 0, lean * 0.5]}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.05, 0.07, 0.008]} />
        <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} {...FLAT} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.007, 0.007, 0.22, 5]} />
        <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[0, 0.285, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 0.05, 5]} />
        <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
      </mesh>
    </group>
  );
}

export function PeatCutter({ selected, heater = "none" }: { selected: boolean; heater?: HeaterState }) {
  const timber = selected ? SELECTED : C.log;
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, FACING, 0]}>
      {/* The cut bank at the back, stepping down toward the yard. */}
      <Tier z={-0.52} depth={0.22} height={0.22} width={0.95} x={-0.1} snow={5} />
      <Tier z={-0.33} depth={0.16} height={0.14} width={0.85} x={-0.12} snow={3} />
      <Tier z={-0.18} depth={0.14} height={0.07} width={0.6} x={-0.22} snow={2} />
      <Spade position={[0.12, 0.14, -0.35]} lean={-0.25} />
      <Spade position={[-0.38, 0.07, -0.19]} lean={0.2} />

      {/* Ricks of bricks drying in the wind. */}
      <PeatRick position={[0.36, 0, 0.32]} rotationY={0.3} />
      <PeatRick position={[0.12, 0, 0.55]} rotationY={-0.2} />
      <PeatRick position={[0.58, 0, 0.12]} rotationY={0.8} />

      {/* Open drying shed, stacked full. */}
      <group position={[-0.45, 0, 0.3]}>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[sx * 0.17, sz === 1 ? 0.17 : 0.22, sz * 0.13]} castShadow>
              <boxGeometry args={[0.03, sz === 1 ? 0.34 : 0.44, 0.03]} />
              <meshStandardMaterial color={timber} roughness={1} {...FLAT} />
            </mesh>
          )),
        )}
        <group position={[0, 0.39, 0]} rotation={[0.38, 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.44, 0.025, 0.36]} />
            <meshStandardMaterial color={C.roof} roughness={0.95} {...FLAT} />
          </mesh>
          <SnowBlanket width={0.44} depth={0.36} phase={1.9} position={[0, 0.012, 0]} />
        </group>
        <mesh position={[0, 0.11, -0.01]} castShadow>
          <boxGeometry args={[0.3, 0.22, 0.2]} />
          <meshStandardMaterial color="#33281f" roughness={1} {...FLAT} />
        </mesh>
        {[0.045, 0.09, 0.135, 0.18].map((y) => (
          <mesh key={y} position={[0, y, 0.091]}>
            <boxGeometry args={[0.3, 0.005, 0.004]} />
            <meshStandardMaterial color={C.peatDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
        {[-0.1, -0.04, 0.02, 0.08].map((x, i) => (
          <mesh key={x} position={[x + (i % 2) * 0.02, 0.11, 0.092]}>
            <boxGeometry args={[0.004, 0.22, 0.004]} />
            <meshStandardMaterial color={C.peatDark} roughness={1} {...FLAT} />
          </mesh>
        ))}
      </group>

      {/* A loaded wheelbarrow. */}
      <group position={[-0.08, 0, 0.5]} rotation={[0, 0.9, 0]}>
        <mesh position={[0, 0.1, 0]} rotation={[0, 0, 0.12]} castShadow>
          <boxGeometry args={[0.18, 0.06, 0.13]} />
          <meshStandardMaterial color={timber} roughness={1} {...FLAT} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={BRICK} material={BRICK_MAT[i % 2]} position={[-0.04 + i * 0.04, 0.145, (i - 1) * 0.03]} rotation={[0, i * 0.7, 0.1]} />
        ))}
        <mesh position={[0.12, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.02, 8]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[-0.14, 0.09, s * 0.05]} rotation={[0, 0, 0.3]}>
              <cylinderGeometry args={[0.007, 0.007, 0.16, 5]} />
              <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
            </mesh>
            <mesh position={[-0.06, 0.035, s * 0.05]}>
              <boxGeometry args={[0.01, 0.07, 0.01]} />
              <meshStandardMaterial color={C.logDark} {...FLAT} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Iron brazier for the cutters' hands. */}
      <group position={BRAZIER}>
        {[0, 2.1, 4.2].map((a) => (
          <mesh key={a} position={[Math.sin(a) * 0.05, 0.06, Math.cos(a) * 0.05]}>
            <cylinderGeometry args={[0.006, 0.006, 0.12, 4]} />
            <meshStandardMaterial color={C.iron} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.05, 0.06, 8, 1, true]} />
          <meshStandardMaterial color={C.iron} metalness={0.5} roughness={0.5} side={2} {...FLAT} />
        </mesh>
        <Embers position={[0, 0.12, 0]} size={1.4} />
      </group>

      <Heater state={heater} position={HEATER_AT} rotationY={0} />

      <SnowHeaps
        at={[
          [0.55, -0.4, 0.12],
          [-0.65, -0.05, 0.1],
          [0.35, 0.62, 0.08],
        ]}
      />
    </group>
  );
}
