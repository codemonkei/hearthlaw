/*
 * Townsfolk on foot: small hooded figures who trudge from door to door carrying a torch or a
 * lamp, leaving a trail of footprints that slowly fill back in with snow. Purely decoration —
 * the sim never reads them. How many are out follows the living population; they stand still
 * while the watch is paused. Lights come out only once the sky darkens. From 22:30 everyone
 * heads home, by midnight the streets are empty, and they step out again from 06:00.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useGame } from "@/game/store";
import { livingCount } from "@/game/sim/engine";
import { HEX_SIZE, hexToWorld } from "@/game/sim/hex";
import type { SimState } from "@/game/sim/types";
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
const STRIDE = 0.12;
/** Figures are modelled about a hand tall; this brings them up beside the houses. */
const FIGURE_SCALE = 1.8;
const WALK_SPEED = 0.32;
/** Pointer events pass straight through the figures to the tiles beneath. */
const noHit = () => null;

const COATS = ["#6b3a2e", "#4a5563", "#5c4a36", "#7a6232", "#3f4a3c", "#5a3348"];

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
}

const SCARVES = ["#a8352a", "#c48a2c", "#3d6b8a", "#7b8f4a", "#e0d6c2", "#8a3a5c"];
const TROUSERS = ["#2e2a26", "#3a3530", "#2a3038", "#3b3226"];
const SKINS = ["#e2b593", "#c99572", "#a8765a", "#f0cdb0"];
const TRIMS = ["#ece6da", "#d9cbb4", "#bfb2a0"];

/**
 * A townsperson, about a hand tall with feet at y 0, facing +z: boots and trousers on legs that
 * swing from the hip, a belted coat flaring over them, a fur-trimmed hood around a face, a
 * scarf, mittens, sometimes a pack. The right hand holds the torch or lamp. Named parts
 * (legL, legR, armL, armR, light) are posed every frame by Walkers.
 */
function Figure({ look }: { look: Look }) {
  const { coat, trim, scarf, trousers, skin, torch, pack } = look;
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
      {/* Shoulders. */}
      <mesh position={[0, 0.157, 0]} scale={[1.25, 0.55, 1]} raycast={noHit} castShadow>
        <sphereGeometry args={[0.034, 8, 6]} />
        <meshStandardMaterial color={coat} roughness={0.9} />
      </mesh>
      {/* Scarf wound at the neck, one tail hanging down the front. */}
      <mesh position={[0, 0.168, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noHit}>
        <torusGeometry args={[0.019, 0.008, 5, 10]} />
        <meshStandardMaterial color={scarf} roughness={1} />
      </mesh>
      <mesh position={[0.01, 0.148, 0.03]} rotation={[0.15, 0, 0.1]} raycast={noHit}>
        <boxGeometry args={[0.01, 0.032, 0.004]} />
        <meshStandardMaterial color={scarf} roughness={1} />
      </mesh>
      {/* Head: a face set inside a hood, ringed with fur. */}
      <mesh position={[0, 0.19, 0.008]} raycast={noHit}>
        <sphereGeometry args={[0.019, 8, 6]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>
      {[-0.007, 0.007].map((x) => (
        <mesh key={x} position={[x, 0.193, 0.026]} raycast={noHit}>
          <sphereGeometry args={[0.0022, 4, 3]} />
          <meshStandardMaterial color="#1a1310" />
        </mesh>
      ))}
      <mesh position={[0, 0.194, -0.006]} scale={[1, 1.08, 1]} raycast={noHit} castShadow>
        <sphereGeometry args={[0.03, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={coat} roughness={0.9} side={2} />
      </mesh>
      <mesh position={[0, 0.183, -0.012]} raycast={noHit}>
        <sphereGeometry args={[0.028, 8, 6]} />
        <meshStandardMaterial color={coat} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.19, 0.018]} raycast={noHit}>
        <torusGeometry args={[0.022, 0.0075, 5, 12]} />
        <meshStandardMaterial color={trim} roughness={1} />
      </mesh>
      {/* A pack on the back for those hauling something between doors. */}
      {pack && (
        <group position={[0, 0.13, -0.045]}>
          <mesh raycast={noHit} castShadow>
            <boxGeometry args={[0.05, 0.055, 0.03]} />
            <meshStandardMaterial color="#6b5236" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.034, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noHit}>
            <cylinderGeometry args={[0.012, 0.012, 0.056, 6]} />
            <meshStandardMaterial color="#8a7a5c" roughness={1} />
          </mesh>
          {[-0.018, 0.018].map((x) => (
            <mesh key={x} position={[x, 0.01, 0.022]} raycast={noHit}>
              <boxGeometry args={[0.006, 0.05, 0.004]} />
              <meshStandardMaterial color="#2b1d14" />
            </mesh>
          ))}
        </group>
      )}
      {arm(1)}
      {arm(
        -1,
        // The light hangs from the right hand; Walkers keeps it upright as the arm moves.
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
        </group>,
      )}
    </group>
  );
}

export function Walkers({ sim }: { sim: SimState }) {
  const fx = useGame((s) => s.fx);
  const heightAt = useMemo(() => makeHeightAt(sim), [sim]);
  const living = livingCount(sim);
  // Low graphics (phones, weak GPUs) keeps the crowd smaller: each figure is a few dozen parts.
  const cap = fx === "low" ? 8 : MAX_WALKERS;
  const count = sim.buildings.length === 0 ? 0 : Math.min(cap, Math.max(2, Math.round(living / 7)));
  // A few carry real light on better graphics tiers; the rest glow through bloom alone.
  const lit = fx === "high" ? 4 : fx === "medium" ? 2 : 0;

  const looks = useMemo(
    () =>
      Array.from({ length: MAX_WALKERS }, (_, i) => ({
        coat: COATS[i % COATS.length],
        trim: TRIMS[i % TRIMS.length],
        scarf: SCARVES[(i * 5 + 2) % SCARVES.length],
        trousers: TROUSERS[(i * 3) % TROUSERS.length],
        skin: SKINS[(i * 7 + 1) % SKINS.length],
        torch: i % 3 !== 1,
        pack: i % 4 === 2 || i % 5 === 0,
      })),
    [],
  );

  const walkers = useRef<Walker[]>([]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const prints = useRef<THREE.InstancedMesh>(null);
  const printAge = useRef(new Float32Array(PRINTS).fill(PRINT_LIFE));
  const printPose = useRef(new Float32Array(PRINTS * 4));
  const nextPrint = useRef(0);
  const clock = useRef(0);

  // Doors people walk between: every building, and the Kiln, where folk go to warm their hands.
  const spots = useMemo(() => {
    const out: [number, number][] = [[0, 0]];
    for (const b of sim.buildings) {
      const [x, , z] = hexToWorld(b.q, b.r, sim.terrain);
      out.push([x, z]);
    }
    return out;
  }, [sim, sim.buildings.length]);
  // Where people sleep: housing if there is any, otherwise any building.
  const homes = useMemo(() => {
    const out: [number, number][] = [];
    for (const b of sim.buildings) {
      if (BUILDINGS[b.kind].housing <= 0) continue;
      const [x, , z] = hexToWorld(b.q, b.r, sim.terrain);
      out.push([x, z]);
    }
    return out.length > 0 ? out : spots.slice(1);
  }, [sim, sim.buildings.length, spots]);

  const pickTrip = (w: Walker) => {
    const here: [number, number] = [w.x, w.z];
    const pool = w.homeward && homes.length > 0 ? homes : spots;
    let target = pool[Math.floor(Math.random() * pool.length)];
    for (let tries = 0; tries < 4 && Math.hypot(target[0] - w.x, target[1] - w.z) < HEX_SIZE * 1.2; tries++) {
      target = pool[Math.floor(Math.random() * pool.length)];
    }
    const reach = target[0] === 0 && target[1] === 0 ? HEX_SIZE * 0.85 : HEX_SIZE * 0.5;
    const end = doorstep(target, here, reach);
    w.path = route(here, end);
    w.wait = 0;
  };

  // Keep one walker record per figure; new ones appear on a doorstep.
  if (walkers.current.length < count && spots.length > 0) {
    for (let i = walkers.current.length; i < count; i++) {
      const from = spots[1 + Math.floor(Math.random() * (spots.length - 1))] ?? spots[0];
      const ang = Math.random() * Math.PI * 2;
      const w: Walker = {
        x: from[0] + Math.cos(ang) * HEX_SIZE * 0.5,
        z: from[1] + Math.sin(ang) * HEX_SIZE * 0.5,
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
      };
      walkers.current.push(w);
    }
  }

  useEffect(() => {
    const mesh = prints.current;
    if (!mesh) return;
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < PRINTS; i++) mesh.setMatrixAt(i, hide);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // A small oval boot print lying flat on the snow, long along the walking direction.
  const printGeo = useMemo(() => new THREE.CircleGeometry(0.032, 7).rotateX(-Math.PI / 2).scale(0.65, 1, 1.25), []);
  useEffect(() => () => printGeo.dispose(), [printGeo]);

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
    clock.current += dt;
    const minuteOfDay = s ? s.minute % 1440 : 12 * 60;
    const hour = minuteOfDay / 60;
    const night = hour < WAKE;
    const bedtime = hour >= BEDTIME;

    const drop = (x: number, z: number, heading: number, side: number) => {
      const i = nextPrint.current;
      nextPrint.current = (i + 1) % PRINTS;
      const ox = Math.cos(heading) * 0.035 * side;
      const oz = -Math.sin(heading) * 0.035 * side;
      const pose = printPose.current;
      pose[i * 4] = x + ox;
      pose[i * 4 + 1] = heightAt(x + ox, z + oz) + 0.012;
      pose[i * 4 + 2] = z + oz;
      pose[i * 4 + 3] = heading;
      printAge.current[i] = 0;
    };

    for (let i = 0; i < walkers.current.length; i++) {
      const w = walkers.current[i];
      const g = groups.current[i];
      if (!g) continue;
      const active = i < count;

      // The night: everyone goes in at midnight, and gets up a little after WAKE.
      if (night) {
        w.asleep = true;
        w.homeward = false;
        w.path = [];
      } else if (w.asleep && minuteOfDay >= WAKE * 60 + w.wakeDelay) {
        // Step out of a house door, facing out into the street.
        const home = homes[Math.floor(Math.random() * homes.length)] ?? spots[0];
        const ang = Math.random() * Math.PI * 2;
        w.x = home[0] + Math.cos(ang) * HEX_SIZE * 0.5;
        w.z = home[1] + Math.sin(ang) * HEX_SIZE * 0.5;
        w.heading = Math.atan2(Math.cos(ang), Math.sin(ang));
        w.asleep = false;
        w.wait = Math.random() * 2;
      }
      if (bedtime && !w.homeward && !w.asleep) {
        w.homeward = true;
        w.path = [];
        w.wait = Math.min(w.wait, Math.random() * 2);
      }

      g.visible = active && !w.asleep;
      if (!g.visible) continue;

      let moving = false;
      if (pace > 0) {
        if (w.wait > 0) {
          w.wait -= dt * pace;
        } else if (w.path.length === 0) {
          pickTrip(w);
        } else {
          const [tx, tz] = w.path[0];
          const dx = tx - w.x;
          const dz = tz - w.z;
          const d = Math.hypot(dx, dz);
          const step = w.speed * pace * dt;
          if (d <= step) {
            w.x = tx;
            w.z = tz;
            w.path.shift();
            // A pause on arrival: a word at the door, hands to the fire. Or in, for the night.
            if (w.path.length === 0) {
              if (w.homeward) {
                w.asleep = true;
                w.homeward = false;
              } else w.wait = 1 + Math.random() * 4;
            }
          } else {
            w.x += (dx / d) * step;
            w.z += (dz / d) * step;
            const want = Math.atan2(dx, dz);
            let turn = want - w.heading;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            w.heading += turn * Math.min(1, dt * 8);
            moving = true;
            w.stepAcc += step;
            if (w.stepAcc >= STRIDE) {
              w.stepAcc -= STRIDE;
              w.left = !w.left;
              drop(w.x, w.z, w.heading, w.left ? 1 : -1);
            }
          }
        }
      }

      if (moving) w.bob += dt * pace * 9;
      const bounce = moving ? Math.abs(Math.sin(w.bob)) * 0.02 : 0;
      g.position.set(w.x, heightAt(w.x, w.z) + bounce, w.z);
      g.rotation.set(0, w.heading, moving ? Math.sin(w.bob) * 0.04 : 0);
      // Lights only once the sky has darkened enough for this one to want one.
      const dark = weather.daylight < w.lightAt;
      const parts = (g.userData.parts ??= {
        legL: g.getObjectByName("legL"),
        legR: g.getObjectByName("legR"),
        armL: g.getObjectByName("armL"),
        armR: g.getObjectByName("armR"),
        light: g.getObjectByName("light"),
      }) as Record<"legL" | "legR" | "armL" | "armR" | "light", THREE.Object3D | undefined>;
      // A walking stride: legs swing opposite, the free arm against its leg; at rest, still.
      const swing = moving ? Math.sin(w.bob) : 0;
      if (parts.legL) parts.legL.rotation.x = swing * 0.55;
      if (parts.legR) parts.legR.rotation.x = -swing * 0.55;
      if (parts.armL) parts.armL.rotation.x = -swing * 0.45;
      // The light hand is held out in front; empty-handed it swings like the other.
      if (parts.armR) parts.armR.rotation.x = dark ? -0.75 + swing * 0.08 : swing * 0.45;
      const carried = parts.light;
      if (carried) {
        carried.visible = dark;
        carried.rotation.x = -(parts.armR?.rotation.x ?? 0);
      }
      const lamp = (g.userData.lamp ??= g.getObjectByName("lamp")) as THREE.PointLight | undefined;
      if (lamp) lamp.intensity = dark ? POINT_LIGHT : 0;
      const flame = (g.userData.flame ??= g.getObjectByName("flame")) as THREE.Object3D | undefined;
      if (flame && dark) {
        const f = 1 + Math.sin(clock.current * 17 + i * 3.1) * 0.12 + Math.sin(clock.current * 29 + i) * 0.08;
        flame.scale.set(1, f, 1);
      }
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
  });

  return (
    <group>
      <instancedMesh ref={prints} args={[printGeo, undefined, PRINTS]} raycast={noHit} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial color="#56667a" transparent opacity={0.6} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
      {looks.map((look, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)} visible={false}>
          <group scale={FIGURE_SCALE}>
            <Figure look={look} />
          </group>
          {/* Kept mounted and dimmed to 0 by day: switching lights on and off would recompile every shader. */}
          {i < lit && <pointLight name="lamp" position={[0.08, 0.36, 0.1]} color={look.torch ? "#ff9a3c" : "#ffd27a"} intensity={0} distance={1.6} decay={2} />}
        </group>
      ))}
    </group>
  );
}
