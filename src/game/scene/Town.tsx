import { useGLTF } from "@react-three/drei";
import { Suspense, type ReactNode } from "react";
import * as THREE from "three";
import { SNOW_COVER, Smoke, WINDOW_MATERIALS, type SmokeEmitter } from "@/game/scene/Atmosphere";
import { hash, ModelFallback, PlacedModels, useModelParts, type Placement } from "@/game/scene/models";
import { buildingWarmth } from "@/game/sim/engine";
import { hexToWorld } from "@/game/sim/hex";
import type { BuildingKind, SimState } from "@/game/sim/types";

/*
 * Buildings assembled from modular Kenney parts (Holiday, Fantasy Town and Space kits, all CC0),
 * built into public/models/town.glb by `npm run models:town` and graded to the harsh palette.
 *
 * A blueprint lists parts in kit units: 1 = one wall segment, y = 0 is the tile top, +z is the
 * front. Holiday cabin walls sit on a cell's +z edge and rotate about the cell centre; Fantasy
 * walls sit on the +x edge. Windows and chimneys are listed separately so night glow and smoke
 * keep working.
 */

const URL = "/models/town.glb";
const D = Math.PI / 180;

type Vec3 = [number, number, number];
/** [model, x, y, z, rotY°, scale] — scale may be per-axis. */
type PartSpec = [string, number, number, number, number?, (number | Vec3)?];

interface Blueprint {
  /** World units per kit unit. */
  unit: number;
  parts: PartSpec[];
  /** Lit windows: position and facing (rotY°), kit units. */
  windows?: [number, number, number, number][];
  /** Chimney mouths: position and smoke thickness. */
  chimneys?: [number, number, number, number][];
}

// --- Holiday log-cabin helpers (cells are 1×1, walls 1 tall) ---------------------------------

const EDGE = { front: 0, right: 90, back: 180, left: -90 } as const;
type Edge = keyof typeof EDGE;

function wall(model: string, cx: number, cz: number, edge: Edge, y = 0): PartSpec {
  return [`holiday/${model}`, cx, y, cz, EDGE[edge]];
}

/** Corner posts for a cabin spanning cells x∈[x0,x1], z∈[z0,z1] (cell centres). */
function corners(x0: number, x1: number, z0: number, z1: number): PartSpec[] {
  return [
    ["holiday/cabin-corner-logs", x0, 0, z1, 0],
    ["holiday/cabin-corner-logs", x1, 0, z1, 90],
    ["holiday/cabin-corner-logs", x1, 0, z0, 180],
    ["holiday/cabin-corner-logs", x0, 0, z0, -90],
  ];
}

/** A snow-capped gable roof over a cabin `len` cells long (ridge along z), with gable ends. */
function snowRoof(len: number, y = 1): PartSpec[] {
  const half = (len - 1) / 2;
  return [
    ["holiday/cabin-roof-point", 0, y, 0, 0, [1, 1, (len + 0.4) / 1.4]],
    ["holiday/cabin-roof-top", 0, y + 1.26, 0, 0, [1, 1, len + 0.4]],
    ["holiday/cabin-wall-roof-center", 0, y, half, 0],
    ["holiday/cabin-wall-roof-center", 0, y, -half, 180],
  ];
}

const BLUEPRINTS: Record<BuildingKind, Blueprint> = {
  tent: {
    unit: 0.6,
    parts: [
      ["holiday/cabin-roof-point", 0, 0, 0, 0, 0.85],
      ["holiday/sled", 0.85, 0, 0.3, 20, 0.8],
    ],
  },
  hut: {
    unit: 0.55,
    parts: [
      wall("cabin-doorway", 0, 0, "front"),
      wall("cabin-window-a", 0, 0, "right"),
      wall("cabin-wall", 0, 0, "left"),
      wall("cabin-wall", 0, 0, "back"),
      ...corners(0, 0, 0, 0),
      ...snowRoof(1),
      ["fantasy/chimney-top", 0, 1.05, -0.2, 0, 0.9],
      ["holiday/snow-pile", -0.95, 0, 0.55, 30, 0.55],
    ],
    windows: [[0.68, 0.5, 0, 90]],
    chimneys: [[0.32, 1.7, -0.2, 0.7]],
  },
  longhouse: {
    unit: 0.5,
    parts: [
      wall("cabin-doorway", 0, 0.5, "front"),
      wall("cabin-wall", 0, -0.5, "back"),
      wall("cabin-window-a", 0, 0.5, "right"),
      wall("cabin-window-a", 0, -0.5, "right"),
      wall("cabin-wall", 0, 0.5, "left"),
      wall("cabin-window-a", 0, -0.5, "left"),
      ...corners(0, 0, -0.5, 0.5),
      ...snowRoof(2),
      ["fantasy/chimney-top", 0, 1.05, -0.6, 0, 0.9],
      ["holiday/lantern", 0.75, 0, 1.25, 0, 0.45],
      ["holiday/sled-long", -1.05, 0, 0.1, 0, 0.75],
    ],
    windows: [
      [0.68, 0.5, 0.5, 90],
      [0.68, 0.5, -0.5, 90],
      [-0.68, 0.5, -0.5, -90],
    ],
    chimneys: [[0.32, 1.7, -0.6, 0.9]],
  },
  mess: {
    unit: 0.5,
    parts: [
      wall("cabin-doorway", 0, 0.5, "front"),
      wall("cabin-wall", 0, -0.5, "back"),
      wall("cabin-window-large", 0, 0.5, "right"),
      wall("cabin-wall", 0, -0.5, "right"),
      wall("cabin-wall", 0, 0.5, "left"),
      wall("cabin-wall", 0, -0.5, "left"),
      ...corners(0, 0, -0.5, 0.5),
      ...snowRoof(2),
      ["fantasy/chimney-top", 0, 1.05, -0.65, 0, 1],
      ["fantasy/chimney-top", 0, 1.05, 0.35, 180, 0.8],
      ["holiday/bench", 1.25, 0, 0.5, 90, 0.6],
      ["fantasy/stall", 1.25, 0, -0.55, 90, 0.75],
    ],
    windows: [[0.95, 0.5, 0.5, 90]],
    chimneys: [
      [0.34, 1.7, -0.65, 1],
      [-0.34, 1.55, 0.35, 0.8],
    ],
  },
  trappers: {
    unit: 0.55,
    parts: [
      wall("cabin-wall-low", 0, 0, "front"),
      wall("cabin-wall-low", 0, 0, "back"),
      wall("cabin-wall-low", 0, 0, "left"),
      wall("cabin-wall-low", 0, 0, "right"),
      ["holiday/cabin-roof-point", 0, 0.4, 0, 0, 0.95],
      ["fantasy/poles-horizontal", 0.55, 0, 0, 0, 0.8],
      ["holiday/sled-long", -0.95, 0, 0.2, 10, 0.8],
    ],
  },
  peat: {
    unit: 0.55,
    parts: [
      ["fantasy/planks", 0, 0, 0, 0, [1.2, 1, 1.2]],
      ["fantasy/pillar-wood", -0.5, 0, -0.5, 0, [1, 0.85, 1]],
      ["fantasy/pillar-wood", 0.5, 0, -0.5, 0, [1, 0.85, 1]],
      ["fantasy/pillar-wood", -0.5, 0, 0.5, 0, [1, 0.85, 1]],
      ["fantasy/pillar-wood", 0.5, 0, 0.5, 0, [1, 0.85, 1]],
      ["fantasy/roof-flat", 0, 0.85, 0, 0, [1.25, 1, 1.25]],
      ["fantasy/cart", 1.0, 0, 0.35, 25, 0.9],
    ],
  },
  wood: {
    unit: 0.55,
    parts: [
      ["fantasy/wall-wood", 0, 0, 0, 0],
      ["fantasy/wall-wood-door", 0, 0, 0, -90],
      ["fantasy/wall-wood", 0, 0, 0, 180],
      ["fantasy/wall-wood", 0, 0, 0, 90],
      ["fantasy/roof-gable", 0, 1, 0, 0, [1, 1.1, 1]],
      ["holiday/train-wagon-logs", 0.2, 0, 1.0, 0, 1.6],
      ["fantasy/cart-high", -0.95, 0, 0.1, -15, 0.8],
    ],
  },
  salvage: {
    unit: 0.55,
    parts: [
      ["fantasy/wall-wood-broken", 0, 0, 0, 180],
      ["fantasy/wall-wood-broken", 0, 0, 0, 90],
      ["space/barrels", 0.3, 0, 0.25, 30, 1.4],
      ["space/barrel", -0.2, 0, 0.55, 0, 1.6],
      ["fantasy/cart", 0.85, 0, -0.35, -30, 0.9],
      ["holiday/rocks-medium", -0.6, 0, 0.6, 40, 0.35],
      ["fantasy/fence-broken", 0, 0, 0, 0],
    ],
  },
  ironworks: {
    unit: 0.55,
    parts: [
      ["fantasy/wall-block", -0.5, 0, 0, 0],
      ["fantasy/wall-block", 0.5, 0, 0, 0],
      ["fantasy/roof-flat", -0.5, 1, 0, 0],
      ["fantasy/roof-flat", 0.5, 1, 0, 0],
      ["space/chimney_detailed", 0.6, 1, -0.2, 0, [1.2, 0.9, 1.2]],
      ["space/machine_barrelLarge", -0.45, 0, 0.85, 0, 0.9],
      ["space/barrels", 0.55, 0, 0.85, 0, 1.2],
    ],
    windows: [[-0.5, 0.35, 0.52, 0]],
    chimneys: [[0.6, 2.85, -0.2, 1]],
  },
  infirmary: {
    unit: 0.55,
    parts: [
      ["holiday/floor-stone", 0, 0.01, 1.0, 0, 1],
      wall("cabin-doorway", 0, 0, "front"),
      wall("cabin-window-a", 0, 0, "right"),
      wall("cabin-window-a", 0, 0, "left"),
      wall("cabin-wall", 0, 0, "back"),
      ...corners(0, 0, 0, 0),
      ...snowRoof(1),
      ["fantasy/chimney-top", 0, 1.05, -0.2, 0, 0.8],
      ["fantasy/banner-red", 0.3, 0.15, 0, 0, 0.9],
      ["holiday/lantern", 0.55, 0, 1.0, 0, 0.45],
    ],
    windows: [
      [0.68, 0.5, 0, 90],
      [-0.68, 0.5, 0, -90],
    ],
    chimneys: [[0.32, 1.6, -0.2, 0.6]],
  },
  survey: {
    unit: 0.5,
    parts: [
      ["fantasy/wall-block", 0, 0, 0, 0],
      ["fantasy/wall-wood", 0, 1, 0, 0],
      ["fantasy/wall-wood-window-small", 0, 1, 0, -90],
      ["fantasy/wall-wood", 0, 1, 0, 180],
      ["fantasy/wall-wood", 0, 1, 0, 90],
      ["fantasy/roof-high-point", 0, 2, 0, 0],
      ["holiday/lantern", 0.75, 0, 0.75, 0, 0.45],
    ],
    windows: [[0, 1.5, 0.52, 0]],
  },
  depot: {
    unit: 0.55,
    parts: [
      ["fantasy/planks", -0.5, 0, 0, 0],
      ["fantasy/planks", 0.5, 0, 0, 0],
      ["fantasy/pillar-wood", -0.95, 0, -0.45, 0],
      ["fantasy/pillar-wood", 0.95, 0, -0.45, 0],
      ["fantasy/pillar-wood", -0.95, 0, 0.45, 0],
      ["fantasy/pillar-wood", 0.95, 0, 0.45, 0],
      ["fantasy/roof-flat", -0.5, 1, 0, 0, [1.05, 1, 1.1]],
      ["fantasy/roof-flat", 0.5, 1, 0, 0, [1.05, 1, 1.1]],
      ["space/barrels", -0.45, 0.06, -0.1, 0, 1.4],
      ["space/barrels", 0.4, 0.06, 0.15, 60, 1.4],
      ["holiday/sled", 0.2, 0, 0.95, 90, 0.7],
    ],
  },
  vent: {
    unit: 0.55,
    parts: [
      ["space/supports_high", 0, 0, 0, 0, 0.9],
      ["space/machine_barrelLarge", 0, 0.9, 0, 0, 0.75],
    ],
  },
};

/** The stalled convoy: a locomotive and its wagons on a short spur just outside the cirque. */
const CONVOY: { model: string; along: number }[] = [
  { model: "holiday/train-locomotive", along: 0 },
  { model: "holiday/train-tender", along: -0.55 },
  { model: "holiday/train-wagon", along: -1.15 },
  { model: "holiday/train-wagon-logs", along: -1.95 },
  { model: "holiday/train-wagon-flat", along: -2.75 },
];

const _m = new THREE.Matrix4();
const _p = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** World matrix for one part: tile origin → building facing and unit → part transform. */
function partMatrix(base: THREE.Matrix4, [, x, y, z, rot = 0, scale = 1]: PartSpec): THREE.Matrix4 {
  const sc = typeof scale === "number" ? [scale, scale, scale] : scale;
  _p.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, rot * D), _s.set(sc[0]!, sc[1]!, sc[2]!));
  return new THREE.Matrix4().multiplyMatrices(base, _p);
}

function buildingBase(x: number, top: number, z: number, facing: number, unit: number): THREE.Matrix4 {
  return _m.compose(_v.set(x, top, z), _q.setFromAxisAngle(UP, facing), _s.set(unit, unit, unit)).clone();
}

/** Face the camera's side of the map, with a little variety per tile. */
function facingFor(q: number, r: number): number {
  return Math.PI / 4 + (Math.floor(hash(q, r, 71) * 3) - 1) * (Math.PI / 3);
}

interface TownLayout {
  items: Map<string, Placement[]>;
  windows: { pos: Vec3; rotY: number; warmth: number }[];
  smoke: SmokeEmitter[];
}

function layout(sim: SimState): TownLayout {
  const items = new Map<string, Placement[]>();
  const add = (model: string, matrix: THREE.Matrix4) => {
    const p: Placement = { pos: [0, 0, 0], rotY: 0, scale: 1, matrix };
    // Blueprints say "kit/part"; the GLB names nodes "kit_part" (GLTFLoader strips slashes).
    const key = model.replace("/", "_");
    const list = items.get(key);
    if (list) list.push(p);
    else items.set(key, [p]);
  };
  const windows: TownLayout["windows"] = [];
  const smoke: SmokeEmitter[] = [];
  const local = new THREE.Vector3();

  for (const b of sim.buildings) {
    const bp = BLUEPRINTS[b.kind];
    const [x, top, z] = hexToWorld(b.q, b.r, sim.terrain);
    const facing = facingFor(b.q, b.r);
    const base = buildingBase(x, top, z, facing, bp.unit);
    for (const part of bp.parts) add(part[0], partMatrix(base, part));
    const warmth = buildingWarmth(sim, b);
    for (const [wx, wy, wz, wr] of bp.windows ?? []) {
      local.set(wx, wy, wz).applyMatrix4(base);
      windows.push({ pos: [local.x, local.y, local.z], rotY: facing + wr * D, warmth });
    }
    for (const [cx, cy, cz, strength] of bp.chimneys ?? []) {
      local.set(cx, cy, cz).applyMatrix4(base);
      smoke.push({ pos: [local.x, local.y, local.z], strength });
    }
  }

  // The convoy sits on the ground outside the map, on the camera's left.
  const a = (215 * Math.PI) / 180;
  const ox = Math.cos(a) * 11.5;
  const oz = Math.sin(a) * 11.5;
  const along = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
  const trainScale = 2.4;
  const heading = Math.atan2(along.z, -along.x);
  for (let i = -6; i <= 6; i++) {
    const m = buildingBase(ox + along.x * i * 0.5 * trainScale, -0.01, oz + along.z * i * 0.5 * trainScale, heading, trainScale);
    add("holiday/trainset-rail-straight", m);
  }
  for (const car of CONVOY) {
    const m = buildingBase(ox + along.x * car.along * trainScale, 0.03, oz + along.z * car.along * trainScale, heading, trainScale);
    add(car.model, m);
  }
  add("holiday/snow-bunker", buildingBase(ox + along.x * 2.2, 0, oz + along.z * 2.2, heading, 1.6));

  return { items, windows, smoke };
}

function Windows({ windows }: { windows: TownLayout["windows"] }) {
  return (
    <>
      {windows.map((w, i) => (
        <mesh
          key={i}
          position={w.pos}
          rotation={[0, w.rotY, 0]}
          material={w.warmth >= 1 ? WINDOW_MATERIALS.warm : w.warmth >= 0 ? WINDOW_MATERIALS.mild : WINDOW_MATERIALS.cold}
        >
          <boxGeometry args={[0.13, 0.11, 0.02]} />
        </mesh>
      ))}
    </>
  );
}

/**
 * Snow on upward-facing surfaces, a whole face at a time. `SNOW_COVER` (0..1) follows the storm:
 * in calm weather only flat tops and ridges are white; a blizzard buries the roof slopes too.
 */
function addSnowCover(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowCover = SNOW_COVER;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uSnowCover;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float up = inverseTransformDirection(normal, viewMatrix).y;
          // Whole faces, no noise: flat tops always hold snow; roof slopes stay bare timber
          // in calm weather and whiten face by face as the storm builds.
          float flatTop = smoothstep(0.93, 0.97, up);
          float slope = smoothstep(0.55, 0.7, up) * (1.0 - flatTop);
          float cover = flatTop * mix(0.8, 1.0, uSnowCover) + slope * smoothstep(0.35, 0.95, uSnowCover);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), cover);
        }`,
      );
  };
  m.customProgramCacheKey = () => "hearthlaw-snow-cover";
}

/** Harsh, faceted, non-metallic: the space kit's chrome reads as weathered iron. Snow settles on top. */
function townMaterial(src: THREE.Material): THREE.Material {
  const m = (src as THREE.MeshStandardMaterial).clone();
  m.flatShading = true;
  m.roughness = 0.92;
  m.metalness = 0;
  addSnowCover(m);
  m.needsUpdate = true;
  return m;
}

function TownLayer({ sim }: { sim: SimState }) {
  const parts = useModelParts(URL, townMaterial);
  const town = layout(sim);
  return (
    <group>
      <PlacedModels parts={parts} items={town.items} />
      <Windows windows={town.windows} />
      <Smoke emitters={town.smoke} />
    </group>
  );
}

/** Every building, assembled from kit parts. `fallback` draws the old shapes if the parts cannot load. */
export function TownBuildings({ sim, fallback }: { sim: SimState; fallback: ReactNode }) {
  return (
    <ModelFallback label="town parts" fallback={fallback}>
      <Suspense fallback={fallback}>
        <TownLayer sim={sim} />
      </Suspense>
    </ModelFallback>
  );
}

useGLTF.preload(URL);
