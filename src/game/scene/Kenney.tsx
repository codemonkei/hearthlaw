import { useGLTF } from "@react-three/drei";
import { Suspense, type ReactNode } from "react";
import * as THREE from "three";
import { hash, ModelFallback, PlacedModels, useModelParts, type Placement } from "@/game/scene/models";
import { liveDeposit } from "@/game/sim/engine";
import { HEX_SIZE, hexToWorld } from "@/game/sim/hex";
import type { BuildingKind, SimState } from "@/game/sim/types";

/*
 * Experimental tileset: Kenney's Hexagon Kit (CC0), regraded to a harsh winter palette
 * by `npm run models:kenney`. Each map tile gets a kit tile on top of its column, and
 * the buildings with a sensible match use the kit's building tiles.
 */

const URL = "/models/kenney-hex.glb";

/** Kit hexes are 1.0 across the flats; ours are √3 · HEX_SIZE. Same orientation (corners on z). */
export const KENNEY_SCALE = Math.sqrt(3) * HEX_SIZE;
/** Kit tiles are 0.2 thick before scaling; their top sits at y = 0.2. */
export const KENNEY_TILE_TOP = 0.2 * KENNEY_SCALE;

const BUILDING_MODEL: Partial<Record<BuildingKind, string>> = {
  hut: "building-cabin",
  longhouse: "building-village",
  mess: "building-market",
  peat: "building-mine",
  ironworks: "building-smelter",
  survey: "building-tower",
  infirmary: "building-house",
};

/** The kit model that replaces our own shapes for this building, if any. */
export function kenneyBuildingFor(kind: BuildingKind): string | null {
  return BUILDING_MODEL[kind] ?? null;
}

/** Faceted shading reads colder and rougher than the kit's smooth toy look. */
function harshMaterial(src: THREE.Material): THREE.Material {
  const m = (src as THREE.MeshStandardMaterial).clone();
  m.flatShading = true;
  m.roughness = 0.95;
  m.metalness = 0;
  m.needsUpdate = true;
  return m;
}

function tileModel(sim: SimState, q: number, r: number): string {
  const t = sim.tiles.find((x) => x.q === q && x.r === r)!;
  if (q === 0 && r === 0) return "stone";
  const b = t.buildingId != null ? sim.buildings.find((x) => x.id === t.buildingId) : undefined;
  if (b) {
    const kit = kenneyBuildingFor(b.kind);
    if (kit) return kit;
    if (b.kind === "wood") return "dirt-lumber";
    return "grass";
  }
  const live = liveDeposit(t);
  if (live === "timber") return "grass-forest";
  if (live === "peat") return "dirt";
  if (live === "scrap") return "stone-rocks";
  if (live === "lichen") return "stone";
  if (t.deposit === "timber") return "dirt-lumber";
  if (t.deposit !== "none") return "dirt";
  return hash(q, r, 41) < 0.12 ? "grass-hill" : "grass";
}

function placements(sim: SimState): Map<string, Placement[]> {
  const out = new Map<string, Placement[]>();
  for (const t of sim.tiles) {
    const [x, top, z] = hexToWorld(t.q, t.r, sim.terrain);
    const model = tileModel(sim, t.q, t.r);
    const building = model.startsWith("building-");
    // Plain tiles turn in 60° steps for variety; buildings keep one facing.
    const rotY = building ? 0 : Math.floor(hash(t.q, t.r, 43) * 6) * (Math.PI / 3);
    const p: Placement = { pos: [x, top - KENNEY_TILE_TOP, z], rotY, scale: KENNEY_SCALE };
    const list = out.get(model);
    if (list) list.push(p);
    else out.set(model, [p]);
  }
  return out;
}

function KenneyLayer({ sim }: { sim: SimState }) {
  const parts = useModelParts(URL, harshMaterial);
  return <PlacedModels parts={parts} items={placements(sim)} />;
}

export function KenneyTiles({ sim, fallback }: { sim: SimState; fallback?: ReactNode }) {
  return (
    <ModelFallback label="Kenney hexagon kit" fallback={fallback ?? null}>
      <Suspense fallback={fallback ?? null}>
        <KenneyLayer sim={sim} />
      </Suspense>
    </ModelFallback>
  );
}

useGLTF.preload(URL);
