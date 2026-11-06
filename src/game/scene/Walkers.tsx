/*
 * Townsfolk on foot: small hooded figures who trudge from door to door carrying a torch or a
 * lamp, leaving a trail of footprints that slowly fill back in with snow. Purely decoration —
 * the sim never reads them. How many are out follows the living population; they stand still
 * while the watch is paused. Lights come out only once the sky darkens. From 22:30 everyone
 * heads home, by midnight the streets are empty, and they step out again from 06:00.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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

function Figure({ coat, torch }: { coat: string; torch: boolean }) {
  return (
    <group>
      {/* Boots, coat, a hood with a pale fur rim. Feet at y 0. */}
      <mesh position={[0, 0.07, 0]} raycast={noHit} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.14, 7]} />
        <meshStandardMaterial color={coat} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.17, 0]} raycast={noHit} castShadow>
        <sphereGeometry args={[0.042, 8, 6]} />
        <meshStandardMaterial color={coat} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.168, 0.02]} rotation={[Math.PI / 2, 0, 0]} raycast={noHit}>
        <torusGeometry args={[0.03, 0.009, 5, 10]} />
        <meshStandardMaterial color="#e8e2d6" roughness={1} />
      </mesh>
      <mesh position={[0, 0.168, 0.031]} raycast={noHit}>
        <circleGeometry args={[0.022, 8]} />
        <meshStandardMaterial color="#2a1f1a" roughness={1} />
      </mesh>
      {/* The arm out to the side, carrying the light ahead and a little up. Hidden by day. */}
      <group name="light" position={[0.055, 0.12, 0.03]}>
        {torch ? (
          <>
            <mesh position={[0, 0.04, 0]} raycast={noHit}>
              <cylinderGeometry args={[0.006, 0.008, 0.12, 5]} />
              <meshStandardMaterial color="#3b2a1d" roughness={1} />
            </mesh>
            <mesh name="flame" position={[0, 0.115, 0]} raycast={noHit}>
              <coneGeometry args={[0.018, 0.05, 6]} />
              <meshStandardMaterial color="#ffb347" emissive="#ff7a1a" emissiveIntensity={2.4} toneMapped={false} />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[0, 0.03, 0]} raycast={noHit}>
              <boxGeometry args={[0.026, 0.006, 0.026]} />
              <meshStandardMaterial color="#2b2b2b" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh name="flame" position={[0, 0.012, 0]} raycast={noHit}>
              <boxGeometry args={[0.022, 0.03, 0.022]} />
              <meshStandardMaterial color="#ffe0a0" emissive="#ffc35a" emissiveIntensity={2} toneMapped={false} />
            </mesh>
            <mesh position={[0, -0.006, 0]} raycast={noHit}>
              <boxGeometry args={[0.028, 0.006, 0.028]} />
              <meshStandardMaterial color="#2b2b2b" metalness={0.5} roughness={0.5} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

export function Walkers({ sim }: { sim: SimState }) {
  const fx = useGame((s) => s.fx);
  const heightAt = useMemo(() => makeHeightAt(sim), [sim]);
  const living = livingCount(sim);
  const count = sim.buildings.length === 0 ? 0 : Math.min(MAX_WALKERS, Math.max(2, Math.round(living / 7)));
  // A few carry real light on better graphics tiers; the rest glow through bloom alone.
  const lit = fx === "high" ? 4 : fx === "medium" ? 2 : 0;

  const looks = useMemo(
    () =>
      Array.from({ length: MAX_WALKERS }, (_, i) => ({
        coat: COATS[i % COATS.length],
        torch: i % 3 !== 1,
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

      if (moving) w.bob += dt * pace * 14;
      const bounce = moving ? Math.abs(Math.sin(w.bob)) * 0.02 : 0;
      g.position.set(w.x, heightAt(w.x, w.z) + bounce, w.z);
      g.rotation.set(0, w.heading, moving ? Math.sin(w.bob) * 0.06 : 0);
      // Lights only once the sky has darkened enough for this one to want one.
      const dark = weather.daylight < w.lightAt;
      const carried = g.getObjectByName("light");
      if (carried) carried.visible = dark;
      const lamp = g.getObjectByName("lamp") as THREE.PointLight | undefined;
      if (lamp) lamp.intensity = dark ? POINT_LIGHT : 0;
      const flame = g.getObjectByName("flame");
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
            <Figure coat={look.coat} torch={look.torch} />
          </group>
          {/* Kept mounted and dimmed to 0 by day: switching lights on and off would recompile every shader. */}
          {i < lit && <pointLight name="lamp" position={[0.1, 0.42, 0.06]} color={look.torch ? "#ff9a3c" : "#ffd27a"} intensity={0} distance={1.6} decay={2} />}
        </group>
      ))}
    </group>
  );
}
