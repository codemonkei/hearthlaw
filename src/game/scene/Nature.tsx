import { useGLTF } from "@react-three/drei";
import { Component, Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { FACING } from "@/game/scene/parts";
import { LODGE_GROVE } from "@/game/scene/WoodLodge";
import { depositSlot, GROVE_SLOTS, LICHEN_ROCK_SLOTS } from "@/game/scene/Deposits";
import { depositFill, liveDeposit } from "@/game/sim/engine";
import { HEX_SIZE, hexToWorld } from "@/game/sim/hex";
import type { SimState } from "@/game/sim/types";

/*
 * Snow-bound props from Quaternius' Ultimate Nature Pack (CC0), built into
 * public/models/nature.glb by `npm run models:nature`. Every model is drawn as
 * instanced meshes, so a forest of one pine variant is one draw call per material.
 */

const URL = "/models/nature.glb";

export type NatureModel =
  | `PineTree_Snow_${1 | 2 | 3 | 4 | 5}`
  | `Rock_Snow_${1 | 2 | 3 | 4 | 5 | 6 | 7}`
  | `Rock_Moss_${1 | 2 | 3 | 4 | 5 | 6 | 7}`
  | `BirchTree_Dead_Snow_${1 | 2 | 3}`
  | `CommonTree_Dead_Snow_${1 | 2 | 3}`
  | "Bush_Snow_1"
  | "Bush_Snow_2"
  | "TreeStump_Snow"
  | "WoodLog_Snow";

interface Placement {
  pos: [number, number, number];
  rotY: number;
  scale: number;
}

/** Our palette, not the pack's: brighter snow, colder rock, darker pine. Flat-shaded. */
const PALETTE: Record<string, { color: string; roughness: number }> = {
  Snow: { color: "#e9f0f6", roughness: 0.9 },
  Green: { color: "#2d4a3d", roughness: 0.95 },
  Wood: { color: "#4a3327", roughness: 1 },
  Rock: { color: "#6f7a86", roughness: 0.95 },
  White: { color: "#d9d6cc", roughness: 0.9 },
  Black: { color: "#1d1a18", roughness: 1 },
};

/**
 * One mesh of a model. `local` is the mesh's transform relative to the model root and is
 * applied per instance, never baked into the geometry: the GLB is meshopt-quantized, so
 * positions are normalized int16 in [-1, 1] with the real size held in the node scale.
 * Baking that scale into the attribute would clamp it and slice the model.
 */
type Part = { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 };

/** Collect each model's meshes with their local transforms, and swap materials for our palette. */
function useParts(): Map<string, Part[]> {
  const { scene } = useGLTF(URL);
  return useMemo(() => {
    const mats = new Map<string, THREE.Material>();
    const material = (name: string) => {
      let m = mats.get(name);
      if (!m) {
        const p = PALETTE[name] ?? { color: "#9aa4ae", roughness: 0.9 };
        m = new THREE.MeshStandardMaterial({ color: p.color, roughness: p.roughness, flatShading: true });
        mats.set(name, m);
      }
      return m;
    };
    const out = new Map<string, Part[]>();
    scene.updateMatrixWorld(true);
    for (const root of scene.children) {
      const inv = root.matrixWorld.clone().invert();
      const parts: Part[] = [];
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
        parts.push({
          geometry: mesh.geometry,
          material: material(src.name),
          local: new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld),
        });
      });
      out.set(root.name, parts);
    }
    return out;
  }, [scene]);
}

function Instanced({ parts, items }: { parts: Part[]; items: Placement[] }) {
  const placed = useMemo(() => {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    return items.map((it) => {
      q.setFromAxisAngle(up, it.rotY);
      return new THREE.Matrix4().compose(new THREE.Vector3(...it.pos), q, new THREE.Vector3(it.scale, it.scale, it.scale));
    });
  }, [items]);
  const scratch = useMemo(() => new THREE.Matrix4(), []);
  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh
          key={`${i}:${items.length}`}
          args={[p.geometry, p.material, items.length]}
          castShadow
          receiveShadow
          ref={(im) => {
            if (!im) return;
            placed.forEach((mx, k) => im.setMatrixAt(k, scratch.multiplyMatrices(mx, p.local)));
            im.instanceMatrix.needsUpdate = true;
            im.computeBoundingSphere();
          }}
        />
      ))}
    </>
  );
}

/** Stable pseudo-random in [0,1) from integers — props must not reshuffle every render. */
function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const PINES = [1, 2, 3, 4, 5].map((i) => `PineTree_Snow_${i}` as NatureModel);
const SNOW_ROCKS = [1, 2, 3, 4, 5, 6, 7].map((i) => `Rock_Snow_${i}` as NatureModel);
const MOSS_ROCKS = [1, 2, 3, 4, 5, 6, 7].map((i) => `Rock_Moss_${i}` as NatureModel);
const DEAD_TREES = [1, 2, 3].flatMap((i) => [`BirchTree_Dead_Snow_${i}`, `CommonTree_Dead_Snow_${i}`] as NatureModel[]);

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.floor(r * list.length) % list.length]!;
}

/** Points on a tile top, spread so props do not stack. */
function onTile(x: number, z: number, q: number, r: number, k: number, spread: number): [number, number] {
  const a = hash(q, r, k * 7 + 1) * Math.PI * 2;
  const d = (0.25 + hash(q, r, k * 7 + 2) * 0.75) * spread * HEX_SIZE;
  return [x + Math.cos(a) * d, z + Math.sin(a) * d];
}

function placements(sim: SimState): Map<NatureModel, Placement[]> {
  const out = new Map<NatureModel, Placement[]>();
  const add = (m: NatureModel, p: Placement) => {
    const list = out.get(m);
    if (list) list.push(p);
    else out.set(m, [p]);
  };

  for (const t of sim.tiles) {
    const [x, top, z] = hexToWorld(t.q, t.r, sim.terrain);
    const building = t.buildingId != null ? sim.buildings.find((b) => b.id === t.buildingId) : undefined;
    if (building) {
      if (building.kind === "wood") {
        // The lodge stands at the edge of its grove: pines behind it while the grove lasts, stumps after.
        const live = liveDeposit(t) === "timber";
        LODGE_GROVE.forEach(([lx, lz], k) => {
          const c = Math.cos(FACING);
          const s = Math.sin(FACING);
          const pos: [number, number, number] = [x + lx * c + lz * s, top, z - lx * s + lz * c];
          if (live) add(pick(PINES, hash(t.q, t.r, k)), { pos, rotY: hash(t.q, t.r, k + 9) * 6.28, scale: 0.34 + hash(t.q, t.r, k + 3) * 0.1 });
          else add("TreeStump_Snow", { pos, rotY: hash(t.q, t.r, k + 5) * 6.28, scale: 0.28 });
        });
      }
      continue;
    }
    // Groves thin as they are felled: pines stand in fixed slots, stumps take the felled ones.
    if (t.deposit === "timber") {
      const standing = liveDeposit(t) === "timber" ? Math.max(1, Math.ceil(depositFill(t) * GROVE_SLOTS.length)) : 0;
      GROVE_SLOTS.forEach((slot, k) => {
        const [dx, dz] = depositSlot(t.q, t.r, slot);
        const pos: [number, number, number] = [x + dx, top, z + dz];
        if (k < standing) add(pick(PINES, hash(t.q, t.r, k)), { pos, rotY: hash(t.q, t.r, k + 9) * 6.28, scale: 0.3 + hash(t.q, t.r, k + 3) * 0.12 });
        else add("TreeStump_Snow", { pos, rotY: hash(t.q, t.r, k + 5) * 6.28, scale: 0.26 });
      });
    } else if (t.deposit === "lichen") {
      // Lichen-grown boulders while the patch lasts, bare snowy ones once it is scraped.
      const live = liveDeposit(t) === "lichen";
      LICHEN_ROCK_SLOTS.forEach((slot, k) => {
        const [dx, dz] = depositSlot(t.q, t.r, slot);
        add(pick(live ? MOSS_ROCKS : SNOW_ROCKS, hash(t.q, t.r, k + 11)), { pos: [x + dx, top - 0.02, z + dz], rotY: hash(t.q, t.r, k + 13) * 6.28, scale: 0.3 + hash(t.q, t.r, k + 17) * 0.14 });
      });
    }
  }

  // The cirque: cliffs of snowed rock, a pine band behind them, a few dead trees and bushes at the edge.
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + hash(i, 1, 1) * 0.2;
    const rad = 14 + hash(i, 2, 2) * 4;
    add(pick(SNOW_ROCKS, hash(i, 3, 3)), { pos: [Math.cos(a) * rad, -0.3, Math.sin(a) * rad], rotY: hash(i, 4, 4) * 6.28, scale: 3.2 + hash(i, 5, 5) * 3.4 });
  }
  for (let i = 0; i < 110; i++) {
    const a = hash(i, 6, 6) * Math.PI * 2;
    const rad = 11 + hash(i, 7, 7) * 13;
    add(pick(PINES, hash(i, 8, 8)), { pos: [Math.cos(a) * rad, -0.05, Math.sin(a) * rad], rotY: hash(i, 9, 9) * 6.28, scale: 0.8 + hash(i, 10, 10) * 0.7 });
  }
  for (let i = 0; i < 12; i++) {
    const a = hash(i, 11, 11) * Math.PI * 2;
    const rad = 10.5 + hash(i, 12, 12) * 3;
    add(pick(DEAD_TREES, hash(i, 13, 13)), { pos: [Math.cos(a) * rad, -0.05, Math.sin(a) * rad], rotY: hash(i, 14, 14) * 6.28, scale: 0.7 + hash(i, 15, 15) * 0.4 });
  }
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 16, 16) * Math.PI * 2;
    const rad = 10 + hash(i, 17, 17) * 2.5;
    add(hash(i, 18, 18) > 0.5 ? "Bush_Snow_1" : "Bush_Snow_2", { pos: [Math.cos(a) * rad, -0.05, Math.sin(a) * rad], rotY: hash(i, 19, 19) * 6.28, scale: 0.5 + hash(i, 20, 20) * 0.4 });
  }
  return out;
}

function NatureLayer({ sim }: { sim: SimState }) {
  const parts = useParts();
  const items = placements(sim);
  return (
    <group>
      {[...items].map(([model, list]) => {
        const p = parts.get(model);
        return p ? <Instanced key={model} parts={p} items={list} /> : null;
      })}
    </group>
  );
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[Hearthlaw] nature models failed to load; using simple shapes.", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Trees, rocks and the cirque around the map. While the GLB loads, or if it cannot,
 * `fallback` draws the old procedural shapes so the map is never bare.
 */
export function Nature({ sim, fallback }: { sim: SimState; fallback: ReactNode }) {
  return (
    <Fallback fallback={fallback}>
      <Suspense fallback={fallback}>
        <NatureLayer sim={sim} />
      </Suspense>
    </Fallback>
  );
}

useGLTF.preload(URL);
