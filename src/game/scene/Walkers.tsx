/*
 * Townsfolk on foot: small hooded figures who trudge from door to door, leaving a trail of
 * footprints that slowly fill back in with snow. Purely decoration — the sim never reads them.
 *
 * How many are out follows the living population; they stand still while the watch is paused.
 * They carry what the place they left makes (logs from the woodcutters, peat, a brace of hares,
 * a crate of scrap), warm their hands at the Kiln, look about while they wait, puff breath into
 * the cold, and lean into the wind as the weather worsens. Some children trail an adult.
 * Torches and lamps come out only once the sky darkens. From 22:30 everyone heads home, by
 * midnight the streets are empty, and they step out again from 06:00.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useGame } from "@/game/store";
import { livingCount } from "@/game/sim/engine";
import { HEX_SIZE, hexToWorld } from "@/game/sim/hex";
import type { BuildingKind, SimState } from "@/game/sim/types";
import { makeHeightAt } from "@/game/scene/terrain";
import { weather } from "@/game/scene/Atmosphere";
import { BUILDINGS } from "@/game/sim/content";

/** Hours of the night shift: home from BEDTIME, indoors by midnight, out again at WAKE. */
const BEDTIME = 22.5;
const WAKE = 6;
const POINT_LIGHT = 1.1;

const MAX_WALKERS = 14;
const PRINTS = 900;
/** Seconds a footprint takes to fill back in. */
const PRINT_LIFE = 45;
const PUFFS = 160;
/** Seconds a breath hangs in the air. */
const PUFF_LIFE = 1.5;
const STRIDE = 0.12;
/** Figures are modelled about a hand tall; this brings them up beside the houses. */
const FIGURE_SCALE = 1.8;
const CHILD_SCALE = 0.68;
const WALK_SPEED = 0.32;
/** Pointer events pass straight through the figures to the tiles beneath. */
const noHit = () => null;

const COATS = ["#6b3a2e", "#4a5563", "#5c4a36", "#7a6232", "#3f4a3c", "#5a3348"];
const SCARVES = ["#a8352a", "#c48a2c", "#3d6b8a", "#7b8f4a", "#e0d6c2", "#8a3a5c"];
const TROUSERS = ["#2e2a26", "#3a3530", "#2a3038", "#3b3226"];
const SKINS = ["#e2b593", "#c99572", "#a8765a", "#f0cdb0"];
const TRIMS = ["#ece6da", "#d9cbb4", "#bfb2a0"];
const SNOW = "#f4f7fa";

type Load = "logs" | "peat" | "hare" | "crate";
const LOADS: Load[] = ["logs", "peat", "hare", "crate"];
/** What someone leaving a building carries away from it. */
const LOAD_FROM: Partial<Record<BuildingKind, Load>> = {
  wood: "logs",
  peat: "peat",
  trappers: "hare",
  salvage: "crate",
  ironworks: "crate",
  depot: "crate",
};

/** Children walk with the adult listed just before them. */
const LEADER_OF: Record<number, number> = { 4: 3, 9: 8, 13: 12 };

interface Spot {
  x: number;
  z: number;
  kind: BuildingKind | "kiln";
}

interface Walker {
  x: number;
  z: number;
  heading: number;
  path: [number, number][];
  speed: number;
  wait: number;
  stepAcc: number;
  left: boolean;
  bob: number;
  /** Indoors for the night: hidden, not walking. */
  asleep: boolean;
  /** Heading home to sleep; vanishes on reaching the door. */
  homeward: boolean;
  /** Minutes after WAKE this one gets up, so the town wakes gradually. */
  wakeDelay: number;
  /** Daylight below which this one lights up, so lamps come on one by one at dusk. */
  lightAt: number;
  /** What kind of place they are standing at, and so what they might carry off from it. */
  at: Spot["kind"] | null;
  /** Where the current trip ends. */
  bound: Spot["kind"] | null;
  load: Load | null;
  /** Standing at the Kiln with hands out to it. */
  warming: boolean;
  /** Seconds to the next breath. */
  breath: number;
  /** Smoothed head turn while looking about. */
  look: number;
  /** Index of the adult a child keeps close to, or -1. */
  leader: number;
}

/** The point in front of a tile that faces another point: where someone steps out of a door. */
function doorstep(from: [number, number], toward: [number, number], reach: number): [number, number] {
  const dx = toward[0] - from[0];
  const dz = toward[1] - from[1];
  const d = Math.hypot(dx, dz) || 1;
  return [from[0] + (dx / d) * reach, from[1] + (dz / d) * reach];
}

/** Route from a to b, swinging around the Kiln rather than walking through it. */
function route(a: [number, number], b: [number, number]): [number, number][] {
  const [ax, az] = a;
  const [bx, bz] = b;
  const lx = bx - ax;
  const lz = bz - az;
  const len2 = lx * lx + lz * lz || 1;
  const t = Math.max(0, Math.min(1, -(ax * lx + az * lz) / len2));
  const cx = ax + lx * t;
  const cz = az + lz * t;
  const clear = HEX_SIZE * 0.95;
  if (Math.hypot(cx, cz) >= clear) return [b];
  // Step out sideways to clear the Kiln's tile, on whichever side the line already leans.
  let nx = cx;
  let nz = cz;
  if (Math.hypot(nx, nz) < 1e-3) {
    nx = -lz;
    nz = lx;
  }
  const n = Math.hypot(nx, nz) || 1;
  const r = HEX_SIZE * 1.15;
  return [[(nx / n) * r, (nz / n) * r], b];
}

interface Look {
  coat: string;
  trim: string;
  scarf: string;
  trousers: string;
  skin: string;
  torch: boolean;
  pack: boolean;
  child: boolean;
}

/** The loads, each hidden until carried. Logs, peat and crates ride the left shoulder; hares hang from the hand. */
function Loads() {
  return (
    <>
      <group name="load-logs" position={[-0.04, 0.182, 0]} visible={false}>
        {[
          [0, 0, 0],
          [0.016, 0, 0.002],
          [0.008, 0.014, -0.002],
        ].map(([x, y, z], k) => (
          <group key={k} position={[x, y, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noHit} castShadow>
              <cylinderGeometry args={[0.008, 0.008, 0.1, 6]} />
              <meshStandardMaterial color="#6e4a2c" roughness={1} />
            </mesh>
            {[-0.05, 0.05].map((e) => (
              <mesh key={e} position={[0, 0, e]} rotation={[Math.PI / 2, 0, 0]} raycast={noHit}>
                <cylinderGeometry args={[0.0075, 0.0075, 0.002, 6]} />
                <meshStandardMaterial color="#c9a16a" roughness={1} />
              </mesh>
            ))}
          </group>
        ))}
        <mesh position={[0.008, 0.024, 0]} scale={[1.4, 0.4, 3]} raycast={noHit}>
          <sphereGeometry args={[0.012, 6, 4]} />
          <meshStandardMaterial color={SNOW} roughness={1} />
        </mesh>
      </group>
      <group name="load-peat" position={[-0.038, 0.185, -0.008]} visible={false}>
        <mesh scale={[1, 0.8, 1.25]} raycast={noHit} castShadow>
          <sphereGeometry args={[0.024, 7, 5]} />
          <meshStandardMaterial color="#5a4632" roughness={1} />
        </mesh>
        <mesh position={[0, 0.019, 0]} raycast={noHit}>
          <cylinderGeometry args={[0.006, 0.01, 0.01, 5]} />
          <meshStandardMaterial color="#3d2f22" roughness={1} />
        </mesh>
        {[-0.008, 0.008].map((x) => (
          <mesh key={x} position={[x, 0.018, 0.012]} raycast={noHit}>
            <boxGeometry args={[0.012, 0.01, 0.009]} />
            <meshStandardMaterial color="#2a211a" roughness={1} />
          </mesh>
        ))}
      </group>
      <group name="load-crate" position={[-0.038, 0.19, 0]} visible={false}>
        <mesh raycast={noHit} castShadow>
          <boxGeometry args={[0.036, 0.03, 0.05]} />
          <meshStandardMaterial color="#7a5a3a" roughness={0.95} />
        </mesh>
        {[-0.016, 0.016].map((z) => (
          <mesh key={z} position={[0, 0, z]} raycast={noHit}>
            <boxGeometry args={[0.038, 0.032, 0.004]} />
            <meshStandardMaterial color="#4a3826" roughness={0.95} />
          </mesh>
        ))}
        <mesh position={[0.004, 0.019, 0.006]} rotation={[0, 0.5, 0.3]} raycast={noHit}>
          <boxGeometry args={[0.03, 0.008, 0.008]} />
          <meshStandardMaterial color="#6d7378" metalness={0.7} roughness={0.5} />
        </mesh>
      </group>
    </>
  );
}

/**
 * A townsperson, about a hand tall with feet at y 0, facing +z: boots and trousers on legs that
 * swing from the hip, a belted coat flaring over them, a fur-trimmed hood around a face, a
 * scarf, mittens, snow settled on the shoulders and hood, sometimes a pack. The right hand
 * holds the torch or lamp. Named parts (legL, legR, armL, armR, head, light, load-*) are posed
 * every frame by Walkers.
 */
function Figure({ look }: { look: Look }) {
  const { coat, trim, scarf, trousers, skin, torch, pack, child } = look;
  const leg = (side: 1 | -1) => (
    <group name={side === 1 ? "legL" : "legR"} position={[0.017 * side, 0.082, 0]}>
      <mesh position={[0, -0.036, 0]} raycast={noHit} castShadow>
        <cylinderGeometry args={[0.012, 0.011, 0.07, 6]} />
        <meshStandardMaterial color={trousers} roughness={0.95} />
      </mesh>
      {/* Boot: a dark cuff and a toe pointing forward. */}
      <mesh position={[0, -0.07, 0.008]} raycast={noHit} castShadow>
        <boxGeometry args={[0.026, 0.024, 0.04]} />
        <meshStandardMaterial color="#231a14" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.056, 0]} raycast={noHit}>
        <cylinderGeometry args={[0.015, 0.015, 0.01, 6]} />
        <meshStandardMaterial color={trim} roughness={1} />
      </mesh>
    </group>
  );
  const arm = (side: 1 | -1, children?: ReactNode) => (
    <group name={side === 1 ? "armL" : "armR"} position={[0.043 * -side, 0.158, 0]}>
      <mesh position={[0, -0.03, 0]} rotation={[0, 0, 0.12 * side]} raycast={noHit} castShadow>
        <cylinderGeometry args={[0.013, 0.011, 0.064, 6]} />
        <meshStandardMaterial color={coat} roughness={0.9} />
      </mesh>
      {/* Fur cuff and mitten. */}
      <mesh position={[0.004 * side, -0.06, 0]} raycast={noHit}>
        <cylinderGeometry args={[0.014, 0.014, 0.01, 6]} />
        <meshStandardMaterial color={trim} roughness={1} />
      </mesh>
      <mesh position={[0.005 * side, -0.071, 0]} raycast={noHit}>
        <sphereGeometry args={[0.011, 6, 5]} />
        <meshStandardMaterial color={scarf} roughness={0.95} />
      </mesh>
      {children}
    </group>
  );
  return (
    <group>
      {leg(1)}
      {leg(-1)}
      {/* Coat: a flared skirt over the hips, the body above, a belt between. */}
      <mesh position={[0, 0.085, 0]} raycast={noHit} castShadow>
        <cylinderGeometry args={[0.036, 0.05, 0.05, 8]} />
        <meshStandardMaterial color={coat} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.0605, 0]} raycast={noHit}>
        <cylinderGeometry args={[0.051, 0.051, 0.006, 8]} />
        <meshStandardMaterial color={trim} roughness={1} />
      </mesh>
      <mesh position={[0, 0.132, 0]} raycast={noHit} castShadow>
        <cylinderGeometry args={[0.034, 0.036, 0.05, 8]} />
        <meshStandardMaterial color={coat} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.11, 0]} raycast={noHit}>
        <cylinderGeometry args={[0.0375, 0.0375, 0.008, 8]} />
        <meshStandardMaterial color="#2b1d14" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.11, 0.037]} raycast={noHit}>
        <boxGeometry args={[0.012, 0.01, 0.004]} />
        <meshStandardMaterial color="#b08d4a" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Coat buttons down the front. */}
      {[0.128, 0.142].map((y) => (
        <mesh key={y} position={[0, y, 0.035]} raycast={noHit}>
          <sphereGeometry args={[0.003, 4, 3]} />
          <meshStandardMaterial color="#2b1d14" />
        </mesh>
      ))}
      {/* Shoulders, with snow settled on top of each. */}
      <mesh position={[0, 0.157, 0]} scale={[1.25, 0.55, 1]} raycast={noHit} castShadow>
        <sphereGeometry args={[0.034, 8, 6]} />
        <meshStandardMaterial color={coat} roughness={0.9} />
      </mesh>
      {[-0.03, 0.03].map((x) => (
        <mesh key={x} position={[x, 0.168, -0.004]} scale={[1.2, 0.35, 1]} raycast={noHit}>
          <sphereGeometry args={[0.014, 6, 4]} />
          <meshStandardMaterial color={SNOW} roughness={1} />
        </mesh>
      ))}
      {/* Scarf wound at the neck, one tail hanging down the front. */}
      <mesh position={[0, 0.168, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noHit}>
        <torusGeometry args={[0.019, 0.008, 5, 10]} />
        <meshStandardMaterial color={scarf} roughness={1} />
      </mesh>
      <mesh position={[0.01, 0.148, 0.03]} rotation={[0.15, 0, 0.1]} raycast={noHit}>
        <boxGeometry args={[0.01, 0.032, 0.004]} />
        <meshStandardMaterial color={scarf} roughness={1} />
      </mesh>
      {/* Head: a face set inside a hood, ringed with fur, snow on the crown. Turns to look about. */}
      <group name="head" position={[0, 0.17, 0]}>
        <mesh position={[0, 0.02, 0.008]} raycast={noHit}>
          <sphereGeometry args={[0.019, 8, 6]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>
        {[-0.007, 0.007].map((x) => (
          <mesh key={x} position={[x, 0.023, 0.026]} raycast={noHit}>
            <sphereGeometry args={[0.0022, 4, 3]} />
            <meshStandardMaterial color="#1a1310" />
          </mesh>
        ))}
        {/* Cold-reddened nose. */}
        <mesh position={[0, 0.018, 0.027]} raycast={noHit}>
          <sphereGeometry args={[0.003, 4, 3]} />
          <meshStandardMaterial color="#c97a6a" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.024, -0.006]} scale={[1, 1.08, 1]} raycast={noHit} castShadow>
          <sphereGeometry args={[0.03, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial color={coat} roughness={0.9} side={2} />
        </mesh>
        <mesh position={[0, 0.013, -0.012]} raycast={noHit}>
          <sphereGeometry args={[0.028, 8, 6]} />
          <meshStandardMaterial color={coat} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.02, 0.018]} raycast={noHit}>
          <torusGeometry args={[0.022, 0.0075, 5, 12]} />
          <meshStandardMaterial color={trim} roughness={1} />
        </mesh>
        <mesh position={[0, 0.03, -0.008]} scale={[1, 1.08, 1]} raycast={noHit}>
          <sphereGeometry args={[0.0305, 9, 3, 0, Math.PI * 2, 0, Math.PI * 0.22]} />
          <meshStandardMaterial color={SNOW} roughness={1} />
        </mesh>
      </group>
      {/* A pack on the back for those hauling something between doors. */}
      {pack && !child && (
        <group position={[0, 0.13, -0.045]}>
          <mesh raycast={noHit} castShadow>
            <boxGeometry args={[0.05, 0.055, 0.03]} />
            <meshStandardMaterial color="#6b5236" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.034, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noHit}>
            <cylinderGeometry args={[0.012, 0.012, 0.056, 6]} />
            <meshStandardMaterial color="#8a7a5c" roughness={1} />
          </mesh>
          <mesh position={[0, 0.046, 0]} scale={[2.2, 0.35, 1]} raycast={noHit}>
            <sphereGeometry args={[0.012, 6, 4]} />
            <meshStandardMaterial color={SNOW} roughness={1} />
          </mesh>
          {[-0.018, 0.018].map((x) => (
            <mesh key={x} position={[x, 0.01, 0.022]} raycast={noHit}>
              <boxGeometry args={[0.006, 0.05, 0.004]} />
              <meshStandardMaterial color="#2b1d14" />
            </mesh>
          ))}
        </group>
      )}
      {!child && <Loads />}
      {arm(
        1,
        // A brace of hares hangs from the left hand.
        !child && (
          <group name="load-hare" position={[0.005, -0.08, 0]} visible={false}>
            {[-0.008, 0.008].map((z) => (
              <group key={z} position={[0, -0.022, z]}>
                <mesh scale={[0.8, 1.6, 0.8]} raycast={noHit} castShadow>
                  <sphereGeometry args={[0.011, 6, 5]} />
                  <meshStandardMaterial color="#8a7a66" roughness={1} />
                </mesh>
                {[-0.004, 0.004].map((e) => (
                  <mesh key={e} position={[e, -0.022, 0]} rotation={[0, 0, e * 30]} raycast={noHit}>
                    <boxGeometry args={[0.003, 0.012, 0.002]} />
                    <meshStandardMaterial color="#6e5f4f" roughness={1} />
                  </mesh>
                ))}
              </group>
            ))}
            <mesh raycast={noHit}>
              <cylinderGeometry args={[0.0015, 0.0015, 0.012, 4]} />
              <meshStandardMaterial color="#3b2a1d" />
            </mesh>
          </group>
        ),
      )}
      {arm(
        -1,
        // The light hangs from the right hand; Walkers keeps it upright as the arm moves.
        !child && (
          <group name="light" position={[-0.005, -0.075, 0]}>
            {torch ? (
              <>
                <mesh position={[0, 0.035, 0]} raycast={noHit}>
                  <cylinderGeometry args={[0.005, 0.007, 0.11, 5]} />
                  <meshStandardMaterial color="#3b2a1d" roughness={1} />
                </mesh>
                <mesh position={[0, 0.088, 0]} raycast={noHit}>
                  <cylinderGeometry args={[0.011, 0.008, 0.016, 6]} />
                  <meshStandardMaterial color="#1e1915" roughness={0.9} />
                </mesh>
                <mesh name="flame" position={[0, 0.112, 0]} raycast={noHit}>
                  <coneGeometry args={[0.016, 0.046, 6]} />
                  <meshStandardMaterial color="#ffb347" emissive="#ff7a1a" emissiveIntensity={2.4} toneMapped={false} />
                </mesh>
              </>
            ) : (
              <group position={[0, -0.03, 0]}>
                {/* Bail handle, cap, glass, base. */}
                <mesh position={[0, 0.032, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noHit}>
                  <torusGeometry args={[0.008, 0.0015, 4, 8, Math.PI]} />
                  <meshStandardMaterial color="#2b2b2b" metalness={0.6} roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.024, 0]} raycast={noHit}>
                  <coneGeometry args={[0.014, 0.012, 6]} />
                  <meshStandardMaterial color="#2b2b2b" metalness={0.6} roughness={0.5} />
                </mesh>
                <mesh name="flame" position={[0, 0.006, 0]} raycast={noHit}>
                  <cylinderGeometry args={[0.01, 0.011, 0.024, 6]} />
                  <meshStandardMaterial color="#ffe0a0" emissive="#ffc35a" emissiveIntensity={2} toneMapped={false} />
                </mesh>
                <mesh position={[0, -0.009, 0]} raycast={noHit}>
                  <cylinderGeometry args={[0.013, 0.013, 0.006, 6]} />
                  <meshStandardMaterial color="#2b2b2b" metalness={0.6} roughness={0.5} />
                </mesh>
              </group>
            )}
          </group>
        ),
      )}
    </group>
  );
}

type Parts = Record<
  "legL" | "legR" | "armL" | "armR" | "head" | "light" | "flame" | "lamp" | Load,
  THREE.Object3D | undefined
>;

export function Walkers({ sim }: { sim: SimState }) {
  const fx = useGame((s) => s.fx);
  const heightAt = useMemo(() => makeHeightAt(sim), [sim]);
  const living = livingCount(sim);
  // Low graphics (phones, weak GPUs) keeps the crowd smaller: each figure is a few dozen parts.
  const cap = fx === "low" ? 8 : MAX_WALKERS;
  const count = sim.buildings.length === 0 ? 0 : Math.min(cap, Math.max(2, Math.round(living / 7)));
  // A few carry real light on better graphics tiers; the rest glow through bloom alone.
  const lit = fx === "high" ? 4 : fx === "medium" ? 2 : 0;

  const looks = useMemo<Look[]>(
    () =>
      Array.from({ length: MAX_WALKERS }, (_, i) => ({
        coat: COATS[i % COATS.length],
        trim: TRIMS[i % TRIMS.length],
        scarf: SCARVES[(i * 5 + 2) % SCARVES.length],
        trousers: TROUSERS[(i * 3) % TROUSERS.length],
        skin: SKINS[(i * 7 + 1) % SKINS.length],
        torch: i % 3 !== 1,
        pack: i % 4 === 2 || i % 5 === 0,
        child: i in LEADER_OF,
      })),
    [],
  );

  const walkers = useRef<Walker[]>([]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const prints = useRef<THREE.InstancedMesh>(null);
  const printAge = useRef(new Float32Array(PRINTS).fill(PRINT_LIFE));
  const printPose = useRef(new Float32Array(PRINTS * 4));
  const nextPrint = useRef(0);
  const puffs = useRef<THREE.InstancedMesh>(null);
  const puffAge = useRef(new Float32Array(PUFFS).fill(PUFF_LIFE));
  const puffPose = useRef(new Float32Array(PUFFS * 6));
  const nextPuff = useRef(0);
  const clock = useRef(0);

  // Doors people walk between: every building, and the Kiln, where folk go to warm their hands.
  const spots = useMemo<Spot[]>(() => {
    const out: Spot[] = [{ x: 0, z: 0, kind: "kiln" }];
    for (const b of sim.buildings) {
      const [x, , z] = hexToWorld(b.q, b.r, sim.terrain);
      out.push({ x, z, kind: b.kind });
    }
    return out;
  }, [sim, sim.buildings.length]);
  // Where people sleep: housing if there is any, otherwise any building.
  const homes = useMemo(() => {
    const out = spots.filter((s) => s.kind !== "kiln" && BUILDINGS[s.kind].housing > 0);
    return out.length > 0 ? out : spots.slice(1);
  }, [spots]);

  const pickTrip = (w: Walker) => {
    const pool = w.homeward && homes.length > 0 ? homes : spots;
    let target = pool[Math.floor(Math.random() * pool.length)];
    for (let tries = 0; tries < 4 && Math.hypot(target.x - w.x, target.z - w.z) < HEX_SIZE * 1.2; tries++) {
      target = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!target) return;
    // Take something from where they stand: the woodcutters' logs, the cutters' peat, a hare.
    const made = w.at && w.at !== "kiln" ? LOAD_FROM[w.at] : undefined;
    w.load = made && !w.homeward && Math.random() < 0.75 ? made : null;
    w.warming = false;
    const reach = target.kind === "kiln" ? HEX_SIZE * 0.85 : HEX_SIZE * 0.5;
    const end = doorstep([target.x, target.z], [w.x, w.z], reach);
    w.path = route([w.x, w.z], end);
    w.at = null;
    w.bound = target.kind;
    w.wait = 0;
  };

  // Keep one walker record per figure; new ones appear on a doorstep.
  if (walkers.current.length < count && spots.length > 0) {
    for (let i = walkers.current.length; i < count; i++) {
      const from = spots[1 + Math.floor(Math.random() * (spots.length - 1))] ?? spots[0];
      const ang = Math.random() * Math.PI * 2;
      const w: Walker = {
        x: from.x + Math.cos(ang) * HEX_SIZE * 0.5,
        z: from.z + Math.sin(ang) * HEX_SIZE * 0.5,
        heading: ang,
        path: [],
        speed: WALK_SPEED * (0.8 + Math.random() * 0.4),
        wait: Math.random() * 3,
        stepAcc: Math.random() * STRIDE,
        left: Math.random() < 0.5,
        bob: Math.random() * 10,
        asleep: false,
        homeward: false,
        wakeDelay: Math.random() * 45,
        lightAt: 0.3 + Math.random() * 0.25,
        at: from.kind,
        bound: null,
        load: null,
        warming: false,
        breath: Math.random() * 2,
        look: 0,
        leader: LEADER_OF[i] ?? -1,
      };
      walkers.current.push(w);
    }
  }

  useEffect(() => {
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [mesh, n] of [
      [prints.current, PRINTS],
      [puffs.current, PUFFS],
    ] as const) {
      if (!mesh) continue;
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, hide);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, []);

  // A small oval boot print lying flat on the snow, long along the walking direction.
  const printGeo = useMemo(() => new THREE.CircleGeometry(0.032, 7).rotateX(-Math.PI / 2).scale(0.65, 1, 1.25), []);
  const puffGeo = useMemo(() => new THREE.IcosahedronGeometry(0.036, 0), []);
  useEffect(
    () => () => {
      printGeo.dispose();
      puffGeo.dispose();
    },
    [printGeo, puffGeo],
  );

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }),
    [],
  );

  useFrame((_, rawDt) => {
    const state = useGame.getState();
    const s = state.sim;
    const dt = Math.min(rawDt, 0.1);
    const paused = !s || s.speed === 0 || state.panel === "settings" || Boolean(s.outcome);
    const pace = paused ? 0 : Math.sqrt(s!.speed);
    const t = (clock.current += dt);
    const minuteOfDay = s ? s.minute % 1440 : 12 * 60;
    const hour = minuteOfDay / 60;
    const night = hour < WAKE;
    const bedtime = hour >= BEDTIME;
    const storm = weather.storm;

    const drop = (x: number, z: number, heading: number, side: number, size: number) => {
      const i = nextPrint.current;
      nextPrint.current = (i + 1) % PRINTS;
      const ox = Math.cos(heading) * 0.035 * side * size;
      const oz = -Math.sin(heading) * 0.035 * side * size;
      const pose = printPose.current;
      pose[i * 4] = x + ox;
      pose[i * 4 + 1] = heightAt(x + ox, z + oz) + 0.012;
      pose[i * 4 + 2] = z + oz;
      pose[i * 4 + 3] = heading;
      printAge.current[i] = 0;
    };
    const breathe = (x: number, y: number, z: number, heading: number) => {
      const i = nextPuff.current;
      nextPuff.current = (i + 1) % PUFFS;
      const pose = puffPose.current;
      pose[i * 6] = x;
      pose[i * 6 + 1] = y;
      pose[i * 6 + 2] = z;
      // Drifts forward and up, pushed along by the wind as the weather worsens.
      pose[i * 6 + 3] = Math.sin(heading) * 0.05 + storm * 0.12;
      pose[i * 6 + 4] = 0.04;
      pose[i * 6 + 5] = Math.cos(heading) * 0.05;
      puffAge.current[i] = 0;
    };

    // Move a walker one step toward a point; returns whether they moved.
    const stepToward = (w: Walker, tx: number, tz: number, speed: number, size: number): boolean => {
      const dx = tx - w.x;
      const dz = tz - w.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, speed * pace * dt);
      if (d < 1e-4 || step <= 0) return false;
      w.x += (dx / d) * step;
      w.z += (dz / d) * step;
      let turn = Math.atan2(dx, dz) - w.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      w.heading += turn * Math.min(1, dt * 8);
      w.stepAcc += step;
      if (w.stepAcc >= STRIDE * size) {
        w.stepAcc -= STRIDE * size;
        w.left = !w.left;
        drop(w.x, w.z, w.heading, w.left ? 1 : -1, size);
      }
      return true;
    };

    for (let i = 0; i < walkers.current.length; i++) {
      const w = walkers.current[i];
      const g = groups.current[i];
      if (!g) continue;
      const active = i < count;
      const child = w.leader >= 0;
      const lead = child ? walkers.current[w.leader] : undefined;
      const size = child ? CHILD_SCALE : 1;
      // Wind slows everyone down.
      const gait = 1 - storm * 0.35;

      if (child) {
        // A child goes in and out with their adult and stays at their side.
        if (!lead || lead.asleep) {
          w.asleep = true;
          if (lead) {
            w.x = lead.x;
            w.z = lead.z;
          }
        } else if (w.asleep) {
          w.asleep = false;
          w.x = lead.x - Math.sin(lead.heading) * 0.2;
          w.z = lead.z - Math.cos(lead.heading) * 0.2;
          w.heading = lead.heading;
        }
      } else if (night) {
        // The night: everyone goes in at midnight, and gets up a little after WAKE.
        w.asleep = true;
        w.homeward = false;
        w.path = [];
      } else if (w.asleep && minuteOfDay >= WAKE * 60 + w.wakeDelay) {
        // Step out of a house door, facing out into the street.
        const home = homes[Math.floor(Math.random() * homes.length)] ?? spots[0];
        const ang = Math.random() * Math.PI * 2;
        w.x = home.x + Math.cos(ang) * HEX_SIZE * 0.5;
        w.z = home.z + Math.sin(ang) * HEX_SIZE * 0.5;
        w.heading = Math.atan2(Math.cos(ang), Math.sin(ang));
        w.asleep = false;
        w.at = home.kind;
        w.load = null;
        w.wait = Math.random() * 2;
      }
      if (!child && bedtime && !w.homeward && !w.asleep) {
        w.homeward = true;
        w.path = [];
        w.wait = Math.min(w.wait, Math.random() * 2);
      }

      g.visible = active && !w.asleep;
      if (!g.visible) continue;

      let moving = false;
      if (pace > 0) {
        if (child && lead) {
          // Keep a pace behind and to the side of the adult; trot to catch up.
          const bx = lead.x - Math.sin(lead.heading) * 0.16 + Math.cos(lead.heading) * 0.13;
          const bz = lead.z - Math.cos(lead.heading) * 0.16 - Math.sin(lead.heading) * 0.13;
          const gap = Math.hypot(bx - w.x, bz - w.z);
          if (gap > 0.03) moving = stepToward(w, bx, bz, Math.min(gap * 3, lead.speed * 1.5) * gait, size);
          else {
            let turn = lead.heading - w.heading;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            w.heading += turn * Math.min(1, dt * 4);
          }
        } else if (w.wait > 0) {
          w.wait -= dt * pace;
        } else if (w.path.length === 0) {
          pickTrip(w);
        } else {
          const [tx, tz] = w.path[0];
          moving = stepToward(w, tx, tz, w.speed * gait, size);
          if (Math.hypot(tx - w.x, tz - w.z) < 1e-3) {
            w.path.shift();
            if (w.path.length === 0) {
              const bound = w.bound;
              if (w.homeward) {
                // In for the night.
                w.asleep = true;
                w.homeward = false;
              } else if (bound === "kiln") {
                // Hands out to the fire for a while, facing it.
                w.warming = true;
                w.heading = Math.atan2(-w.x, -w.z);
                w.wait = 3 + Math.random() * 4;
              } else {
                // A word at the door; whatever was carried is delivered.
                w.wait = 1 + Math.random() * 4;
              }
              w.at = bound;
              w.load = null;
            }
          }
        }
      }

      // Breath: a puff every second or two, from the face, into the cold.
      if (pace > 0) {
        w.breath -= dt * pace * (moving ? 1.4 : 1);
        if (w.breath <= 0) {
          w.breath = 1.2 + Math.random() * 0.9;
          const S = FIGURE_SCALE * size;
          breathe(
            w.x + Math.sin(w.heading) * 0.05 * S,
            heightAt(w.x, w.z) + 0.19 * S,
            w.z + Math.cos(w.heading) * 0.05 * S,
            w.heading,
          );
        }
      }

      if (moving) w.bob += dt * pace * (child ? 12 : 9);
      const bounce = moving ? Math.abs(Math.sin(w.bob)) * 0.02 * size : 0;
      g.position.set(w.x, heightAt(w.x, w.z) + bounce, w.z);
      // Lean into the walk, more so into a storm; a slight side-to-side sway with each step.
      g.rotation.order = "YXZ";
      const lean = moving ? 0.05 + storm * 0.22 + (w.load ? 0.05 : 0) : 0;
      g.rotation.set(lean, w.heading, moving ? Math.sin(w.bob) * 0.04 : 0);

      const parts = (g.userData.parts ??= {
        legL: g.getObjectByName("legL"),
        legR: g.getObjectByName("legR"),
        armL: g.getObjectByName("armL"),
        armR: g.getObjectByName("armR"),
        head: g.getObjectByName("head"),
        light: g.getObjectByName("light"),
        flame: g.getObjectByName("flame"),
        lamp: g.getObjectByName("lamp"),
        logs: g.getObjectByName("load-logs"),
        peat: g.getObjectByName("load-peat"),
        hare: g.getObjectByName("load-hare"),
        crate: g.getObjectByName("load-crate"),
      }) as Parts;

      // Lights only once the sky has darkened enough for this one to want one.
      const dark = !child && weather.daylight < w.lightAt;
      const shoulderLoad = w.load === "logs" || w.load === "peat" || w.load === "crate";
      for (const l of LOADS) {
        const o = parts[l];
        if (o) o.visible = w.load === l;
      }

      // A walking stride: legs swing opposite, the free arm against its leg; at rest, still.
      const swing = moving ? Math.sin(w.bob) : 0;
      if (parts.legL) parts.legL.rotation.x = swing * 0.55;
      if (parts.legR) parts.legR.rotation.x = -swing * 0.55;
      if (parts.armL) {
        // Up to steady a shoulder load, out to the Kiln, or swinging.
        parts.armL.rotation.x = w.warming ? -1.25 : shoulderLoad ? -2.6 : -swing * 0.45;
        parts.armL.rotation.z = shoulderLoad && !w.warming ? 0.25 : 0;
      }
      // The light hand is held out in front; empty-handed it swings like the other.
      if (parts.armR)
        parts.armR.rotation.x = w.warming ? -1.25 : dark ? -0.75 + swing * 0.08 : child ? swing * 0.5 : swing * 0.45;
      if (parts.light) {
        parts.light.visible = dark;
        parts.light.rotation.x = -(parts.armR?.rotation.x ?? 0);
      }
      if (parts.hare) parts.hare.rotation.x = -(parts.armL?.rotation.x ?? 0) + swing * 0.2;

      // Looking about while waiting at a door; eyes front while walking or at the fire.
      const looking = !moving && !w.warming && w.wait > 0;
      const want = looking ? Math.sin(t * 0.55 + i * 2.3) * 0.75 : 0;
      w.look += (want - w.look) * Math.min(1, dt * 3);
      if (parts.head) {
        parts.head.rotation.y = w.look;
        parts.head.rotation.x = moving ? 0.1 + storm * 0.25 : 0;
      }

      const flicker = 1 + Math.sin(t * 17 + i * 3.1) * 0.12 + Math.sin(t * 29 + i) * 0.08;
      if (parts.lamp) (parts.lamp as THREE.PointLight).intensity = dark ? POINT_LIGHT * (0.85 + (flicker - 1) * 1.2) : 0;
      if (parts.flame && dark) parts.flame.scale.set(1, flicker, 1);
    }

    const mesh = prints.current;
    if (mesh) {
      const age = printAge.current;
      const pose = printPose.current;
      for (let i = 0; i < PRINTS; i++) {
        if (age[i] >= PRINT_LIFE) continue;
        if (!paused) age[i] += dt * pace;
        const life = Math.max(0, 1 - age[i] / PRINT_LIFE);
        tmp.p.set(pose[i * 4], pose[i * 4 + 1], pose[i * 4 + 2]);
        tmp.q.setFromAxisAngle(tmp.up, pose[i * 4 + 3]);
        const k = life <= 0 ? 0 : 0.4 + life * 0.6;
        tmp.s.set(k, 1, k);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        mesh.setMatrixAt(i, tmp.m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    const breath = puffs.current;
    if (breath) {
      const age = puffAge.current;
      const pose = puffPose.current;
      tmp.q.identity();
      for (let i = 0; i < PUFFS; i++) {
        if (age[i] >= PUFF_LIFE) continue;
        if (!paused) {
          age[i] += dt * pace;
          pose[i * 6] += pose[i * 6 + 3] * dt * pace;
          pose[i * 6 + 1] += pose[i * 6 + 4] * dt * pace;
          pose[i * 6 + 2] += pose[i * 6 + 5] * dt * pace;
        }
        const u = Math.min(1, age[i] / PUFF_LIFE);
        // Swells as it leaves the mouth, then thins away.
        const k = u >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, u * 1.6 + 0.08)) * (0.5 + u * 1.3);
        tmp.p.set(pose[i * 6], pose[i * 6 + 1], pose[i * 6 + 2]);
        tmp.s.set(k, k * 0.8, k);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        breath.setMatrixAt(i, tmp.m);
      }
      breath.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={prints} args={[printGeo, undefined, PRINTS]} raycast={noHit} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial color="#56667a" transparent opacity={0.6} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
      <instancedMesh ref={puffs} args={[puffGeo, undefined, PUFFS]} raycast={noHit} frustumCulled={false} renderOrder={4}>
        <meshBasicMaterial color="#eef3f8" transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>
      {looks.map((look, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)} visible={false}>
          <group scale={FIGURE_SCALE * (look.child ? CHILD_SCALE : 1)}>
            <Figure look={look} />
          </group>
          {/* Kept mounted and dimmed to 0 by day: switching lights on and off would recompile every shader. */}
          {i < lit && !look.child && (
            <pointLight name="lamp" position={[0.08, 0.36, 0.1]} color={look.torch ? "#ff9a3c" : "#ffd27a"} intensity={0} distance={1.6} decay={2} />
          )}
        </group>
      ))}
    </group>
  );
}
