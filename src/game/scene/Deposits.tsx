import * as THREE from "three";
import { C, FLAT, FACING, SnowBlanket, TILE_TOP } from "@/game/scene/parts";
import { SNOW_COLOR, SnowHeaps } from "@/game/scene/snow";
import type { Deposit } from "@/game/sim/types";

/*
 * The special tiles, hand-built like the buildings: a peat seam (cut bank, hummocks, black ice
 * pools, cotton grass), a standing grove (the nature pack's pines plus a fallen log, saplings and
 * drifts), a scrap heap (a half-buried boiler, girders, a cart wheel, sheet iron) and a lichen
 * patch (mats of lichen in sage, rust and yellow, tufts of reindeer moss, spotted boulders).
 *
 * Each shrinks as it is worked (`fill` from 1 down to 0) and leaves something behind when it is
 * worked out: flooded trenches, stumps and brush, a few scattered plates, scraped rocks.
 * Local units match the buildings: y = 0 is the tile top.
 */

type Kind = Exclude<Deposit, "none">;

/** Stable pseudo-random in [0,1) from integers. */
function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Each deposit tile is turned by a sixth-turn of its own so neighbours do not look stamped. */
export function depositTurn(q: number, r: number): number {
  return FACING + Math.floor(hash(q, r, 77) * 6) * (Math.PI / 3);
}

/** Where the grove's pines stand (deposit-local x, z), in the order they are felled last-to-first. */
export const GROVE_SLOTS: [number, number][] = [
  [-0.3, -0.28],
  [0.3, -0.36],
  [0.42, 0.14],
  [-0.48, 0.22],
  [0.02, 0.0],
];

/** Where the lichen patch's boulders sit (deposit-local x, z). */
export const LICHEN_ROCK_SLOTS: [number, number][] = [
  [-0.36, -0.22],
  [0.34, -0.12],
  [0.0, 0.42],
];

/** Deposit-local (x, z) as an offset on the tile, for placing nature models. */
export function depositSlot(q: number, r: number, [x, z]: [number, number]): [number, number] {
  const a = depositTurn(q, r);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}

const M = {
  peat: new THREE.MeshStandardMaterial({ color: "#433528", roughness: 1, ...FLAT }),
  peatCut: new THREE.MeshStandardMaterial({ color: "#4a3727", roughness: 1, ...FLAT }),
  peatLine: new THREE.MeshStandardMaterial({ color: C.peatDark, roughness: 1, ...FLAT }),
  pool: new THREE.MeshStandardMaterial({ color: "#1b2730", roughness: 0.08, metalness: 0.3, ...FLAT }),
  ice: new THREE.MeshStandardMaterial({ color: "#c9dbe6", roughness: 0.3, ...FLAT }),
  reed: new THREE.MeshStandardMaterial({ color: "#a08a5a", roughness: 1, ...FLAT }),
  snow: new THREE.MeshStandardMaterial({ color: SNOW_COLOR, roughness: 0.9, ...FLAT }),
  bark: new THREE.MeshStandardMaterial({ color: "#5a3e2b", roughness: 1, ...FLAT }),
  woodEnd: new THREE.MeshStandardMaterial({ color: C.logEnd, roughness: 1, ...FLAT }),
  needles: new THREE.MeshStandardMaterial({ color: "#3d5a48", roughness: 0.95, ...FLAT }),
  rust: new THREE.MeshStandardMaterial({ color: "#8a5a3c", metalness: 0.35, roughness: 0.75, ...FLAT }),
  rustDark: new THREE.MeshStandardMaterial({ color: "#5e3a28", metalness: 0.35, roughness: 0.8, ...FLAT }),
  steel: new THREE.MeshStandardMaterial({ color: "#5b5f63", metalness: 0.5, roughness: 0.6, ...FLAT }),
  junk: new THREE.MeshStandardMaterial({ color: "#6a5848", roughness: 1, ...FLAT }),
  rock: new THREE.MeshStandardMaterial({ color: "#7d858c", roughness: 0.95, ...FLAT }),
  scraped: new THREE.MeshStandardMaterial({ color: "#9a9184", roughness: 1, ...FLAT }),
  moss: new THREE.MeshStandardMaterial({ color: "#c9d1b0", roughness: 1, ...FLAT }),
};
const LICHEN = ["#9aab86", "#a7744a", "#b5a861", "#7f9a6a", "#a7ae94"].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide, ...FLAT }),
);

const ICO = new THREE.IcosahedronGeometry(1, 0);
const ICO1 = new THREE.IcosahedronGeometry(1, 1);
const BLADE = new THREE.BoxGeometry(0.008, 1, 0.004);
const MAT_DISC = new THREE.CircleGeometry(1, 7);

export function DepositTile({ deposit, fill, q, r }: { deposit: Kind; fill: number; q: number; r: number }) {
  const rnd = (k: number) => hash(q, r, k);
  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, depositTurn(q, r), 0]}>
      {deposit === "peat" && <PeatSeam fill={fill} rnd={rnd} />}
      {deposit === "timber" && <Grove fill={fill} rnd={rnd} />}
      {deposit === "scrap" && <ScrapHeap fill={fill} rnd={rnd} />}
      {deposit === "lichen" && <LichenPatch fill={fill} rnd={rnd} />}
    </group>
  );
}

type Rnd = (k: number) => number;

/** A tuft of reeds or cotton grass. */
function Reeds({ at, rnd, k, cotton }: { at: [number, number]; rnd: Rnd; k: number; cotton?: boolean }) {
  return (
    <group position={[at[0], 0, at[1]]}>
      {[0, 1, 2, 3].map((i) => {
        const h = 0.07 + rnd(k + i) * 0.06;
        const lean = (rnd(k + i + 9) - 0.5) * 0.6;
        const a = i * 1.6 + rnd(k) * 3;
        return (
          <group key={i} rotation={[0, a, lean]}>
            <mesh geometry={BLADE} material={M.reed} position={[0.01, h / 2, 0]} scale={[1, h, 1]} />
            {cotton && i % 2 === 0 && <mesh geometry={ICO} material={M.snow} position={[0.01, h + 0.006, 0]} scale={0.011} />}
          </group>
        );
      })}
    </group>
  );
}

function PeatSeam({ fill, rnd }: { fill: number; rnd: Rnd }) {
  const worked = fill <= 0;
  const hummockSlots: [number, number, number][] = [
    [-0.32, 0.12, 0.12],
    [0.26, 0.04, 0.1],
    [0.06, 0.42, 0.11],
    [0.48, 0.36, 0.08],
    [-0.52, 0.42, 0.09],
  ];
  const hummocks = worked ? 0 : 2 + Math.round(3 * fill);
  const bankW = 0.35 + 0.5 * fill;
  return (
    <group>
      {!worked && (
        <group position={[-0.05, 0, -0.38]}>
          <mesh material={M.peatCut} position={[0, 0.05, 0]} castShadow receiveShadow>
            <boxGeometry args={[bankW, 0.1, 0.18]} />
          </mesh>
          {[0.025, 0.05, 0.075].map((y) => (
            <mesh key={y} material={M.peatLine} position={[0, y, 0.091]}>
              <boxGeometry args={[bankW, 0.006, 0.004]} />
            </mesh>
          ))}
          <SnowBlanket width={bankW} depth={0.18} phase={rnd(3) * 6} position={[0, 0.102, 0]} />
        </group>
      )}
      {worked &&
        [-0.3, -0.05, 0.2].map((z, i) => (
          <group key={z} position={[-0.05 + i * 0.04, 0, z]}>
            <mesh material={M.pool} position={[0, 0.004, 0]}>
              <boxGeometry args={[0.7 - i * 0.12, 0.008, 0.1]} />
            </mesh>
            <mesh material={M.ice} position={[0.1, 0.009, 0]}>
              <boxGeometry args={[0.24, 0.004, 0.08]} />
            </mesh>
          </group>
        ))}

      {hummockSlots.slice(0, hummocks).map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, rnd(20 + i) * 6, 0]}>
          <mesh geometry={ICO1} material={M.peat} position={[0, s * 0.08, 0]} scale={[s * 1.5, s * 0.38, s * 1.2]} castShadow receiveShadow />
          <mesh geometry={ICO} material={M.snow} position={[-s * 0.15, s * 0.3, -s * 0.12]} rotation={[0, 0.7, 0]} scale={[s * 1.15, s * 0.2, s * 0.9]} />
        </group>
      ))}

      {!worked && (
        <>
          <SnowBlanket width={0.34} depth={0.22} phase={rnd(4) * 6} position={[0.38, 0, -0.32]} rotationY={0.6} />
          <SnowBlanket width={0.3} depth={0.2} phase={rnd(6) * 6} position={[-0.42, 0, 0.0]} rotationY={-0.9} />
          <group position={[0.42, 0, 0.12]} rotation={[0, 0.4 + rnd(7), 0]}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} material={M.peatCut} position={[(i - 1) * 0.05, 0.02, 0]} castShadow>
                <boxGeometry args={[0.045, 0.04, 0.1]} />
              </mesh>
            ))}
            {[0, 1].map((i) => (
              <mesh key={`t${i}`} material={M.peatCut} position={[(i - 0.5) * 0.05, 0.06, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
                <boxGeometry args={[0.045, 0.04, 0.1]} />
              </mesh>
            ))}
            <mesh geometry={ICO} material={M.snow} position={[0, 0.085, 0]} scale={[0.05, 0.015, 0.04]} />
          </group>
        </>
      )}
      {/* Black pools skinned with ice. */}
      {(worked ? [] : ([[0.14, -0.08, 0.13], [-0.2, 0.52, 0.08]] as [number, number, number][])).map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh material={M.pool} position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, i]} scale={[s * 1.3, s, 1]}>
            <circleGeometry args={[1, 9]} />
          </mesh>
          <mesh material={M.ice} position={[s * 0.3, 0.006, 0]} rotation={[-Math.PI / 2, 0, i]} scale={[s * 0.6, s * 0.4, 1]}>
            <circleGeometry args={[1, 6]} />
          </mesh>
        </group>
      ))}

      {(
        [
          [-0.12, 0.2],
          [0.4, -0.2],
          [0.3, 0.55],
          [-0.55, -0.05],
          [0.6, 0.1],
          [-0.35, 0.6],
        ] as [number, number][]
      ).map((at, i) => (
        <Reeds key={i} at={at} rnd={rnd} k={40 + i * 10} cotton={i % 2 === 1} />
      ))}
      {worked && (
        <group position={[0.42, 0, 0.42]} rotation={[0, 0.5, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} material={M.peatCut} position={[(i - 1) * 0.05, 0.02 + (i === 1 ? 0.04 : 0), 0]} castShadow>
              <boxGeometry args={[0.045, 0.04, 0.1]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** A small young pine. */
function Sapling({ at, s }: { at: [number, number]; s: number }) {
  return (
    <group position={[at[0], 0, at[1]]} scale={s}>
      <mesh material={M.bark} position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.012, 0.015, 0.06, 5]} />
      </mesh>
      <mesh material={M.needles} position={[0, 0.13, 0]} castShadow>
        <coneGeometry args={[0.08, 0.18, 6]} />
      </mesh>
      <mesh material={M.snow} position={[0, 0.17, 0]}>
        <coneGeometry args={[0.05, 0.1, 6]} />
      </mesh>
    </group>
  );
}

function Grove({ fill, rnd }: { fill: number; rnd: Rnd }) {
  const worked = fill <= 0;
  return (
    <group>
      {/* A fallen trunk with branch stubs and snow along its back. */}
      <group position={[0.12, 0, 0.46]} rotation={[0, 0.35 + rnd(1) * 0.4, 0]}>
        <mesh material={M.bark} position={[0, 0.04, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 0.5, 7]} />
        </mesh>
        <mesh material={M.woodEnd} position={[0.252, 0.04, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.032, 0.032, 0.004, 7]} />
        </mesh>
        {[-0.12, 0.05].map((x, i) => (
          <mesh key={x} material={M.bark} position={[x, 0.08, i ? 0.02 : -0.02]} rotation={[i ? 0.6 : -0.6, 0, 0.3]}>
            <cylinderGeometry args={[0.008, 0.01, 0.08, 5]} />
          </mesh>
        ))}
        {[-0.16, -0.04, 0.08, 0.18].map((x, i) => (
          <mesh key={x} geometry={ICO} material={M.snow} position={[x, 0.08, 0]} rotation={[0, i, 0]} scale={[0.06, 0.02, 0.035]} />
        ))}
      </group>
      {!worked && <Sapling at={[-0.18, 0.4]} s={0.9 + rnd(2) * 0.3} />}
      {!worked && fill > 0.4 && <Sapling at={[0.55, -0.12]} s={0.7} />}
      {worked && (
        <>
          {/* Brush left from limbing, and wood chips. */}
          <group position={[-0.2, 0, 0.3]}>
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh key={i} material={M.bark} position={[0, 0.02 + i * 0.006, 0]} rotation={[0, i * 0.9, 0.1]}>
                <boxGeometry args={[0.24, 0.01, 0.01]} />
              </mesh>
            ))}
            {[0, 1, 2].map((i) => (
              <mesh key={`n${i}`} material={M.needles} position={[(i - 1) * 0.06, 0.03, (i % 2) * 0.04]} scale={[0.06, 0.025, 0.05]} geometry={ICO} />
            ))}
          </group>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={`c${i}`} material={M.woodEnd} position={[0.15 + rnd(60 + i) * 0.3, 0.004, -0.1 + rnd(70 + i) * 0.3]} rotation={[0, rnd(80 + i) * 3, 0]}>
              <boxGeometry args={[0.03, 0.006, 0.015]} />
            </mesh>
          ))}
        </>
      )}
      <SnowHeaps
        at={[
          [-0.55, -0.05, 0.1],
          [0.5, 0.42, 0.09],
          [0.05, -0.55, 0.1],
        ]}
      />
    </group>
  );
}

/** An I-beam from point to point: web and two flanges. */
function Girder({ length, position, rotation }: { length: number; position: [number, number, number]; rotation: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh material={M.rustDark} castShadow>
        <boxGeometry args={[length, 0.05, 0.008]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={M.rust} position={[0, s * 0.025, 0]} castShadow>
          <boxGeometry args={[length, 0.008, 0.04]} />
        </mesh>
      ))}
    </group>
  );
}

function ScrapHeap({ fill, rnd }: { fill: number; rnd: Rnd }) {
  if (fill <= 0) {
    // Picked clean: a few plates and bolts in the trodden snow.
    return (
      <group>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} material={i % 2 ? M.rust : M.steel} position={[-0.3 + i * 0.2, 0.006, -0.1 + rnd(i) * 0.3]} rotation={[0, rnd(10 + i) * 3, 0]} castShadow>
            <boxGeometry args={[0.1, 0.008, 0.07]} />
          </mesh>
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={`b${i}`} material={M.steel} position={[-0.4 + rnd(20 + i) * 0.8, 0.008, -0.4 + rnd(30 + i) * 0.8]}>
            <boxGeometry args={[0.015, 0.015, 0.015]} />
          </mesh>
        ))}
        <mesh material={M.rustDark} position={[0.25, 0.012, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.06, 0.01, 4, 10]} />
        </mesh>
      </group>
    );
  }
  const k = (0.55 + 0.45 * fill) * 1.35;
  return (
    <group scale={[k, k, k]}>
      {/* The mound everything sits in. */}
      <mesh geometry={ICO1} material={M.junk} position={[0, 0.0, -0.05]} scale={[0.42, 0.075, 0.36]} castShadow receiveShadow />
      {[
        [-0.28, 0.05, -0.1, 0.3, 0.4],
        [0.05, 0.07, 0.18, -0.2, 1.3],
        [0.22, 0.05, -0.28, 0.25, 2.2],
      ].map(([x, y, z, tilt, a], i) => (
        <mesh key={`p${i}`} material={i % 2 ? M.rustDark : M.rust} position={[x!, y!, z!]} rotation={[tilt!, a!, tilt! * 0.5]} castShadow>
          <boxGeometry args={[0.16, 0.008, 0.11]} />
        </mesh>
      ))}
      {/* A boiler drum lying half-buried, its end stove in. */}
      <group position={[-0.12, 0.06, 0.05]} rotation={[0, 0.6, Math.PI / 2]}>
        <mesh material={M.rust} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.4, 10]} />
        </mesh>
        {[-0.12, 0.12].map((y) => (
          <mesh key={y} material={M.rustDark} position={[0, y, 0]}>
            <cylinderGeometry args={[0.114, 0.114, 0.02, 10]} />
          </mesh>
        ))}
        <mesh material={M.junk} position={[0, 0.201, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.004, 10]} />
        </mesh>
      </group>
      {/* Girders stuck up out of the pile. */}
      <Girder length={0.42} position={[0.18, 0.13, -0.12]} rotation={[0.2, 0.5, 0.7]} />
      <Girder length={0.32} position={[-0.25, 0.1, -0.22]} rotation={[-0.1, -0.8, -0.5]} />
      {/* A cart wheel leaning on the drum. */}
      <group position={[0.1, 0.11, 0.24]} rotation={[0.3, 0.4, 0.25]}>
        <mesh material={M.bark} castShadow>
          <torusGeometry args={[0.1, 0.012, 5, 12]} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} material={M.bark} rotation={[0, 0, (i * Math.PI) / 3]}>
            <boxGeometry args={[0.2, 0.01, 0.01]} />
          </mesh>
        ))}
        <mesh material={M.steel} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.03, 6]} />
        </mesh>
      </group>
      {/* Sheet iron, a gear and pipe lengths. */}
      <group position={[0.24, 0.06, 0.02]} rotation={[0.1, -0.4, -0.35]}>
        <mesh material={M.steel} castShadow>
          <boxGeometry args={[0.24, 0.008, 0.16]} />
        </mesh>
        {[-0.08, -0.04, 0, 0.04, 0.08].map((x) => (
          <mesh key={x} material={M.rustDark} position={[x, 0.006, 0]}>
            <boxGeometry args={[0.01, 0.006, 0.16]} />
          </mesh>
        ))}
        <SnowBlanket width={0.22} depth={0.12} phase={rnd(5) * 6} position={[0, 0.006, -0.01]} />
      </group>
      <group position={[-0.02, 0.15, -0.18]} rotation={[1.1, 0.3, 0.2]}>
        <mesh material={M.rust} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.022, 10]} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} material={M.rustDark} position={[Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.022, 0.022, 0.022]} />
            </mesh>
          );
        })}
      </group>
      {[
        [-0.32, 0.05, 0.22, 0.4],
        [0.34, 0.04, -0.3, -0.7],
      ].map(([x, y, z, a], i) => (
        <mesh key={i} material={M.steel} position={[x!, y!, z!]} rotation={[0, a!, Math.PI / 2 - 0.15]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.3, 6]} />
        </mesh>
      ))}
      {/* Snow drifted over the top. */}
      {[
        [-0.06, 0.16, 0.0, 0.045],
        [0.05, 0.08, -0.12, 0.05],
        [-0.3, 0.06, -0.18, 0.05],
        [0.22, 0.04, 0.22, 0.04],
      ].map(([x, y, z, s], i) => (
        <mesh key={`s${i}`} geometry={ICO} material={M.snow} position={[x!, y!, z!]} rotation={[0, i, 0]} scale={[s! * 1.3, s! * 0.5, s! * 1.1]} />
      ))}
    </group>
  );
}

function LichenPatch({ fill, rnd }: { fill: number; rnd: Rnd }) {
  const worked = fill <= 0;
  const matSlots: [number, number, number][] = [
    [-0.1, -0.05, 0.14],
    [0.18, 0.22, 0.12],
    [-0.4, 0.2, 0.11],
    [0.45, -0.38, 0.1],
    [0.08, -0.45, 0.12],
    [-0.15, 0.6, 0.09],
    [0.55, 0.3, 0.09],
  ];
  const mats = worked ? 0 : 3 + Math.round(4 * fill);
  const tuftSlots: [number, number][] = [
    [0.2, -0.05],
    [-0.25, 0.4],
    [0.35, 0.45],
    [-0.55, -0.15],
    [-0.05, 0.2],
  ];
  const tufts = worked ? 0 : 2 + Math.round(3 * fill);
  return (
    <group>
      {/* Mats of lichen in sage, rust and yellow. */}
      {matSlots.slice(0, mats).map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, rnd(i) * 6, 0]}>
          {[0, 1, 2, 3].map((j) => {
            const a = j * 1.7 + rnd(i * 5 + j) * 1.2;
            const d = j === 0 ? 0 : s * (0.45 + rnd(i * 7 + j) * 0.3);
            const b = s * (j === 0 ? 0.75 : 0.45 + rnd(i * 9 + j) * 0.2);
            return (
              <mesh
                key={j}
                geometry={ICO1}
                material={LICHEN[(i + (j === 3 ? 2 : 0)) % LICHEN.length]}
                position={[Math.cos(a) * d, 0.002, Math.sin(a) * d]}
                scale={[b * 1.2, 0.014, b]}
                receiveShadow
              />
            );
          })}
        </group>
      ))}
      {/* Reindeer-moss tufts: clusters of pale little knots. */}
      {tuftSlots.slice(0, tufts).map(([x, z], i) => (
        <group key={`t${i}`} position={[x, 0, z]}>
          {[0, 1, 2, 3, 4, 5].map((j) => {
            const a = j * 1.05 + rnd(i * 10 + j);
            const d = j === 0 ? 0 : 0.03;
            return <mesh key={j} geometry={ICO} material={M.moss} position={[Math.cos(a) * d, 0.018, Math.sin(a) * d]} scale={[0.026, 0.02, 0.026]} castShadow />;
          })}
        </group>
      ))}
      {/* Small boulders, spotted with lichen while it lasts, scraped pale once it is gone. */}
      {(
        [
          [0.5, 0.02, 0.07],
          [-0.55, 0.45, 0.06],
        ] as [number, number, number][]
      ).map(([x, z, s], i) => (
        <group key={`b${i}`} position={[x, 0, z]} rotation={[0, rnd(90 + i) * 6, 0]}>
          <mesh geometry={ICO} material={M.rock} position={[0, s * 0.5, 0]} scale={[s * 1.3, s, s]} castShadow />
          {!worked &&
            [0, 1].map((j) => (
              <mesh key={j} geometry={MAT_DISC} material={LICHEN[(i + j + 1) % LICHEN.length]} position={[j ? -0.02 : 0.02, s * 1.42, j ? 0.01 : -0.01]} rotation={[-Math.PI / 2 + 0.2, 0, j]} scale={[s * 0.5, s * 0.4, 1]} />
            ))}
        </group>
      ))}
      {worked &&
        matSlots.slice(0, 4).map(([x, z, s], i) => (
          <mesh key={`w${i}`} geometry={MAT_DISC} material={M.scraped} position={[x, 0.004, z]} rotation={[-Math.PI / 2, 0, rnd(i) * 6]} scale={[s * 1.2, s * 0.8, 1]} />
        ))}
    </group>
  );
}
