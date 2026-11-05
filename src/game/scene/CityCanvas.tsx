import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { keyDown } from "@/game/input/keys";
import { BUILDINGS, outdoorBand, outdoorTemp } from "@/game/sim/content";
import {
  assessPlacement,
  buildingWarmth,
  describeTile,
  heatLevel,
  inWarmth,
  liveDeposit,
  sourceAt,
  type PlacementFit,
  type TileFit,
} from "@/game/sim/engine";
import { HEX_SIZE, PIT_EDGE, RIM_HEIGHT, hexToWorld, pitFunnelY } from "@/game/sim/hex";
import type { BuildingKind, Deposit, SimState, Terrain } from "@/game/sim/types";

/** Tile tops from hexToWorld; the lowest hexes sit level with this plane. */
const GROUND_Y = -0.02;
/** Half the old slab thickness: structures are authored relative to the slab centre. */
const SLAB_HALF = 0.1;
/** How far each tile column reaches below the ground plane. */
const COLUMN_SINK = 0.3;
import { useGame } from "@/game/store";
import {
  Embers,
  GroundMist,
  PostFx,
  SceneLighting,
  Smoke,
  Snowfall,
  type SmokeEmitter,
} from "@/game/scene/Atmosphere";
import { Nature } from "@/game/scene/Nature";
import { CanvasTent, tentFlue } from "@/game/scene/Tent";
import { hutFlue, hutHeaterFlue, TimberHut } from "@/game/scene/Hut";
import type { HeaterState } from "@/game/scene/Heater";
import { Longhouse, longhouseFlues, longhouseHeaterFlue } from "@/game/scene/Longhouse";
import { Kiln, kilnStackTop } from "@/game/scene/Kiln";
import { MessHall, messFlues, messHeaterFlue } from "@/game/scene/MessHall";
import { TrappersHut, trappersFlue, trappersHeaterFlue } from "@/game/scene/Trappers";
import { PeatCutter, peatFlue, peatHeaterFlue } from "@/game/scene/PeatCutter";
import { WoodLodge, woodFlue, woodHeaterFlue } from "@/game/scene/WoodLodge";
import { SalvagePost, salvageFlue, salvageHeaterFlue } from "@/game/scene/SalvagePost";
import { Ironworks, ironworksFlue, ironworksHeaterFlue } from "@/game/scene/Ironworks";
import { Infirmary, infirmaryFlue, infirmaryHeaterFlue } from "@/game/scene/Infirmary";
import { SurveyHall, surveyFlue, surveyHeaterFlue } from "@/game/scene/SurveyHall";
import { Depot, depotHeaterFlue } from "@/game/scene/Depot";
import { RelayVent, ventFlue } from "@/game/scene/RelayVent";
import { useKilnLab } from "@/game/scene/kilnLab";

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _shift = new THREE.Vector3();

/** How far from the Kiln the camera's focus may wander (the map is ~8 units across its radius). */
const PAN_LIMIT = 10;

/** Keep the focus on the ground and over the map; move the camera with it so the view doesn't jump. */
function clampTarget(c: OrbitControlsImpl) {
  const t = c.target;
  _shift.set(0, -t.y, 0);
  const r = Math.hypot(t.x, t.z);
  if (r > PAN_LIMIT) {
    const k = PAN_LIMIT / r;
    _shift.x = t.x * k - t.x;
    _shift.z = t.z * k - t.z;
  }
  if (_shift.lengthSq() === 0) return;
  t.add(_shift);
  c.object.position.add(_shift);
}

function heatHex(w: number): string {
  if (w <= -3) return "#3c2a62";
  if (w <= -2) return "#2f4d86";
  if (w <= -1) return "#3c6d86";
  if (w <= 0) return "#7d93a4";
  if (w <= 1) return "#c9844a";
  return "#f2a541";
}

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const drive = useGame((s) => s.drive);
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    drive(d);
    const c = controls.current;
    if (!c) return;
    // Dev only: lets tooling frame close-ups of buildings.
    if (import.meta.env.DEV) (window as unknown as { __hearthlawCam?: OrbitControlsImpl }).__hearthlawCam = c;
    clampTarget(c);
    const cam = c.object;
    _fwd.set(c.target.x - cam.position.x, 0, c.target.z - cam.position.z);
    if (_fwd.lengthSq() < 1e-5) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, _up).normalize();
    let strafe = 0;
    let ahead = 0;
    if (keyDown("KeyA") || keyDown("ArrowLeft")) strafe -= 1;
    if (keyDown("KeyD") || keyDown("ArrowRight")) strafe += 1;
    if (keyDown("KeyW") || keyDown("ArrowUp")) ahead += 1;
    if (keyDown("KeyS") || keyDown("ArrowDown")) ahead -= 1;
    const speed = 12 * d * (keyDown("ShiftLeft") ? 2 : 1);
    if (strafe !== 0 || ahead !== 0) {
      const len = Math.hypot(strafe, ahead) || 1;
      const sx = (strafe / len) * speed;
      const sz = (ahead / len) * speed;
      c.target.addScaledVector(_right, sx);
      c.target.addScaledVector(_fwd, sz);
      cam.position.addScaledVector(_right, sx);
      cam.position.addScaledVector(_fwd, sz);
    }
    if (keyDown("KeyQ")) c.setAzimuthalAngle(c.getAzimuthalAngle() + d * 0.65);
    if (keyDown("KeyE")) c.setAzimuthalAngle(c.getAzimuthalAngle() - d * 0.65);
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      maxPolarAngle={Math.PI / 2.4}
      screenSpacePanning={false}
      minPolarAngle={0.38}
      minDistance={8}
      maxDistance={34}
      target={[0, 0, 0]}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      }}
    />
  );
}

type Flue = { at: [number, number, number]; strength: number };

/** Where a lit heater's stovepipe smokes, for the buildings that draw one. */
const HEATER_FLUES: Partial<Record<BuildingKind, () => [number, number, number]>> = {
  hut: hutHeaterFlue,
  longhouse: longhouseHeaterFlue,
  mess: messHeaterFlue,
  trappers: trappersHeaterFlue,
  peat: peatHeaterFlue,
  wood: woodHeaterFlue,
  salvage: salvageHeaterFlue,
  ironworks: ironworksHeaterFlue,
  infirmary: infirmaryHeaterFlue,
  survey: surveyHeaterFlue,
  depot: depotHeaterFlue,
};

/** Where each building's chimney mouths sit, relative to its tile group, and how thick their smoke is. */
function chimneys(kind: BuildingKind, kilnRunning: boolean): Flue[] {
  if (kind === "vent") return kilnRunning ? [{ at: ventFlue(), strength: 0.4 }] : [];
  if (kind === "tent") return [{ at: tentFlue(), strength: 0.75 }];
  if (kind === "hut") return [{ at: hutFlue(), strength: 0.8 }];
  if (kind === "longhouse") {
    const [stack, vent] = longhouseFlues();
    return [
      { at: stack!, strength: 0.9 },
      { at: vent!, strength: 0.6 },
    ];
  }
  if (kind === "mess") return messFlues();
  if (kind === "trappers") return [{ at: trappersFlue(), strength: 0.55 }];
  if (kind === "peat") return [{ at: peatFlue(), strength: 0.35 }];
  if (kind === "wood") return [{ at: woodFlue(), strength: 0.75 }];
  if (kind === "salvage") return [{ at: salvageFlue(), strength: 0.45 }];
  if (kind === "ironworks") return [{ at: ironworksFlue(), strength: 1 }];
  if (kind === "infirmary") return [{ at: infirmaryFlue(), strength: 0.6 }];
  if (kind === "survey") return [{ at: surveyFlue(), strength: 0.6 }];
  return []; // the depot is unheated
}

function Structure({
  kind,
  warmth,
  selected,
  heater = "none",
  kilnRunning = false,
}: {
  kind: BuildingKind;
  warmth: number;
  selected: boolean;
  heater?: HeaterState;
  kilnRunning?: boolean;
}) {
  if (kind === "tent") return <CanvasTent warmth={warmth} selected={selected} />;
  if (kind === "hut") return <TimberHut warmth={warmth} selected={selected} heater={heater} />;
  if (kind === "longhouse") return <Longhouse warmth={warmth} selected={selected} heater={heater} />;
  if (kind === "mess") return <MessHall warmth={warmth} selected={selected} heater={heater} />;
  if (kind === "trappers") return <TrappersHut warmth={warmth} selected={selected} heater={heater} />;
  if (kind === "peat") return <PeatCutter selected={selected} heater={heater} />;
  if (kind === "wood") return <WoodLodge warmth={warmth} selected={selected} heater={heater} />;
  if (kind === "salvage") return <SalvagePost selected={selected} heater={heater} />;
  if (kind === "ironworks") return <Ironworks selected={selected} heater={heater} />;
  if (kind === "infirmary") return <Infirmary warmth={warmth} selected={selected} heater={heater} />;
  if (kind === "survey") return <SurveyHall warmth={warmth} selected={selected} heater={heater} />;
  if (kind === "depot") return <Depot selected={selected} heater={heater} />;
  return <RelayVent active={kilnRunning} selected={selected} />;
}

const DEPOSIT_TILE: Record<Exclude<Deposit, "none">, string> = {
  peat: "#5c5348",
  timber: "#c9d4cf",
  scrap: "#b7aa9c",
  lichen: "#c5d0c4",
};

/** Readable at a glance: cut seams, pines, a rust heap, moss. Local y 0.1 is the tile top. */
function DepositProp({ deposit }: { deposit: Deposit }) {
  if (deposit === "peat") {
    return (
      <group>
        {[-0.24, 0, 0.24].map((z) => (
          <mesh key={z} position={[-0.05, 0.115, z]} receiveShadow>
            <boxGeometry args={[0.8, 0.04, 0.12]} />
            <meshStandardMaterial color="#1c1713" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0.45, 0.17, 0.32]} rotation={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.22, 0.14, 0.14]} />
          <meshStandardMaterial color="#3b2f25" roughness={1} />
        </mesh>
      </group>
    );
  }
  if (deposit === "timber") {
    const pines: [number, number, number][] = [
      [-0.32, -0.12, 1],
      [0.22, -0.3, 0.8],
      [0.08, 0.28, 1.15],
      [0.42, 0.12, 0.7],
    ];
    return (
      <group>
        {pines.map(([x, z, k]) => (
          <group key={`${x}:${z}`} position={[x, 0.1, z]} scale={k}>
            <mesh position={[0, 0.07, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.045, 0.14, 5]} />
              <meshStandardMaterial color="#5a3e2b" roughness={1} />
            </mesh>
            <mesh position={[0, 0.36, 0]} castShadow>
              <coneGeometry args={[0.2, 0.5, 6]} />
              <meshStandardMaterial color="#3d5a48" roughness={0.95} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (deposit === "scrap") {
    return (
      <group>
        <mesh position={[0, 0.18, 0]} rotation={[0.1, 0.4, 0.15]} castShadow>
          <boxGeometry args={[0.38, 0.16, 0.28]} />
          <meshStandardMaterial color="#8a5a3c" roughness={0.8} metalness={0.3} />
        </mesh>
        <mesh position={[0.24, 0.16, 0.2]} rotation={[0, 0.9, -0.2]} castShadow>
          <boxGeometry args={[0.22, 0.1, 0.2]} />
          <meshStandardMaterial color="#6e4a35" roughness={0.85} metalness={0.25} />
        </mesh>
        <mesh position={[-0.2, 0.2, 0.14]} castShadow>
          <coneGeometry args={[0.13, 0.24, 4]} />
          <meshStandardMaterial color="#a0683f" roughness={0.8} metalness={0.3} />
        </mesh>
        <mesh position={[0.05, 0.15, -0.28]} rotation={[0, 0.3, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.55, 6]} />
          <meshStandardMaterial color="#5b5f63" roughness={0.6} metalness={0.5} />
        </mesh>
      </group>
    );
  }
  if (deposit === "lichen") {
    const clumps: [number, number, number, string][] = [
      [-0.3, -0.1, 0.17, "#7f9a6a"],
      [0.15, -0.28, 0.13, "#94a77a"],
      [0.25, 0.2, 0.19, "#6c8458"],
      [-0.1, 0.3, 0.12, "#94a77a"],
      [0.42, -0.05, 0.1, "#7f9a6a"],
    ];
    return (
      <group>
        {clumps.map(([x, z, r, c]) => (
          <mesh key={`${x}:${z}`} position={[x, 0.1 + r * 0.25, z]} scale={[1, 0.45, 1]} castShadow>
            <icosahedronGeometry args={[r, 0]} />
            <meshStandardMaterial color={c} roughness={1} flatShading />
          </mesh>
        ))}
      </group>
    );
  }
  return null;
}

const FIT_TILE: Record<Exclude<TileFit, "ok">, string> = {
  best: "#e9b45c",
  poor: "#56616c",
  blocked: "#7c3b35",
};

const FIT_TEXT: Record<TileFit, string> = {
  best: "text-ember",
  ok: "text-snow",
  poor: "text-mist",
  blocked: "text-blood",
};

const AXIAL_DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/** Glowing outline around every tile the Kiln (and its relay vents) can warm. Grey while banked. */
function HeatRing({ sim }: { sim: SimState }) {
  const burning = heatLevel(sim) > 0;
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }),
    [],
  );
  const edgeGeo = useMemo(() => new THREE.BoxGeometry(HEX_SIZE * 1.02, 0.04, 0.09), []);
  mat.color.set(burning ? "#f2a541" : "#9aa7b6");
  useFrame(({ clock }) => {
    mat.opacity = (burning ? 0.75 : 0.35) + Math.sin(clock.elapsedTime * 2.2) * 0.15;
  });
  const tops = new Map(sim.tiles.map((t) => [`${t.q}:${t.r}`, hexToWorld(t.q, t.r, sim.terrain)[1]]));
  const edges: { pos: [number, number, number]; rot: number }[] = [];
  for (const t of sim.tiles) {
    if (!inWarmth(sim, t.q, t.r)) continue;
    const [x, y, z] = hexToWorld(t.q, t.r, sim.terrain);
    for (const [dq, dr] of AXIAL_DIRS) {
      const nq = t.q + dq;
      const nr = t.r + dr;
      const nTop = tops.get(`${nq}:${nr}`);
      if (nTop != null && inWarmth(sim, nq, nr)) continue;
      const [nx, , nz] = hexToWorld(nq, nr, sim.terrain);
      edges.push({
        pos: [(x + nx) / 2, Math.max(y, nTop ?? y) + 0.03, (z + nz) / 2],
        rot: Math.atan2(nx - x, nz - z),
      });
    }
  }
  return (
    <group>
      {edges.map((e, i) => (
        <mesh key={i} geometry={edgeGeo} material={mat} position={e.pos} rotation={[0, e.rot, 0]} />
      ))}
    </group>
  );
}

type Label = { at: [number, number, number]; title: string; fit?: TileFit; note: string };

function HoverLabel({ at, title, fit, note }: Label) {
  return (
    <Html position={at} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
      <div className="hl-panel whitespace-nowrap px-2.5 py-1.5 text-center">
        <div className="hl-display text-sm leading-tight text-snow">{title}</div>
        <div className={`text-xs ${fit ? FIT_TEXT[fit] : "text-mist"}`}>{note}</div>
      </div>
    </Html>
  );
}

/** Plain shapes for groves, lichen and the cirque, used while the nature models load (or if they cannot). */
function SimpleNature({ sim }: { sim: SimState }) {
  return (
    <group>
      {Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const rad = 16 + (i % 3) * 0.8;
        return (
          <mesh key={i} position={[Math.cos(a) * rad, 0.75, Math.sin(a) * rad]} castShadow>
            <coneGeometry args={[1.4 + (i % 4) * 0.35, 3.2 + (i % 5), 5]} />
            <meshStandardMaterial color={i % 2 ? "#c5d0da" : "#8ea0b0"} roughness={0.95} />
          </mesh>
        );
      })}
      {sim.tiles.map((t) => {
        const deposit = liveDeposit(t);
        if (t.buildingId != null || (deposit !== "timber" && deposit !== "lichen")) return null;
        const [x, top, z] = hexToWorld(t.q, t.r, sim.terrain);
        return (
          <group key={`${t.q}:${t.r}`} position={[x, top - SLAB_HALF, z]}>
            <DepositProp deposit={deposit} />
          </group>
        );
      })}
    </group>
  );
}

/** Fractional hour and outdoor temperature for the sky, read every frame. */
function skyClock() {
  const sim = useGame.getState().sim;
  if (!sim) return null;
  const minute = ((sim.minute % 1440) + 1440) % 1440;
  return { hour: minute / 60, tempC: outdoorTemp(sim.minute) };
}

/** Where tile columns end: just under the ground, or under the bottom of a pit. */
function columnBottom(terrain: Terrain): number {
  return terrain === "pit" ? -RIM_HEIGHT - 0.6 : GROUND_Y - COLUMN_SINK;
}

const GROUND_COLOR = "#9eacb8";

/**
 * Snowfield around the cirque. A pit cuts a round hole into it and lines the hole with a
 * funnel that slopes down under the tiles, so the sunken map reads as dug into the ground.
 */
function Ground({ pit }: { pit: boolean }) {
  const funnel = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const r = (i / 24) * PIT_EDGE;
      pts.push(new THREE.Vector2(r, pitFunnelY(r) + GROUND_Y));
    }
    return new THREE.LatheGeometry(pts, 48);
  }, []);
  if (!pit) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
        <circleGeometry args={[90, 64]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
      </mesh>
    );
  }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
        <ringGeometry args={[PIT_EDGE, 90, 64, 1]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
      </mesh>
      <mesh geometry={funnel} receiveShadow>
        <meshStandardMaterial color="#8f9dab" roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function City() {
  const rev = useGame((s) => s.rev);
  const heat = useGame((s) => s.heat);
  const buildKind = useGame((s) => s.buildKind);
  const selectedId = useGame((s) => s.selectedId);
  const tryPlace = useGame((s) => s.tryPlace);
  const select = useGame((s) => s.select);
  const sim = useGame.getState().sim;
  const pendingTile = useGame((s) => s.pendingTile);
  const kilnFeatures = useKilnLab((s) => s.features);
  const [hoverKey, setHover] = useState<string | null>(null);
  // Touch has no hover: the tile waiting for confirmation stands in for it.
  const hover = hoverKey ?? (pendingTile ? `${pendingTile.q}:${pendingTile.r}` : null);
  const hexGeo = useMemo(() => new THREE.CylinderGeometry(HEX_SIZE * 0.94, HEX_SIZE * 0.96, 1, 6), []);

  if (!sim) return null;
  void rev;

  const temp = outdoorTemp(sim.minute);
  const band = outdoorBand(temp);
  const hoverInfo: { label: Label | null } = { label: null };
  const smoke: SmokeEmitter[] = [];
  const kilnTop = hexToWorld(0, 0, sim.terrain)[1] - SLAB_HALF;
  const kilnLevel = sim.kiln.running ? sim.kiln.pressure + (sim.kiln.surge ? 1 : 0) : 0;
  if (kilnLevel > 0) smoke.push({ pos: [0, kilnTop + kilnStackTop(kilnFeatures) + 0.05, 0], strength: Math.min(1, 0.35 + kilnLevel * 0.18) });

  return (
    <group>
      <Ground pit={sim.terrain === "pit"} />
      <Nature sim={sim} fallback={<SimpleNature sim={sim} />} />
      {sim.tiles.map((tile) => {
        const [x, top, z] = hexToWorld(tile.q, tile.r, sim.terrain);
        // Group origin stays at the old slab centre so structure offsets are unchanged.
        const y = top - SLAB_HALF;
        // Solid column from the tile top down past the ground (or the pit floor), so nothing floats.
        const column = top - columnBottom(sim.terrain);
        const key = `${tile.q}:${tile.r}`;
        const isKiln = tile.q === 0 && tile.r === 0;
        const src = sourceAt(sim, tile.q, tile.r);
        const w = band + src;
        const building = sim.buildings.find((b) => b.id === tile.buildingId) ?? null;
        const deposit = liveDeposit(tile);
        const heaterLit = Boolean(building?.heater && building.heaterFed);
        const heaterFlue = heaterLit && building ? HEATER_FLUES[building.kind]?.() ?? null : null;
        if (heaterFlue) smoke.push({ pos: [x + heaterFlue[0], y + heaterFlue[1], z + heaterFlue[2]], strength: 0.5 });
        for (const flue of building ? chimneys(building.kind, sim.kiln.running) : []) {
          smoke.push({ pos: [x + flue.at[0], y + flue.at[1], z + flue.at[2]], strength: flue.strength });
        }
        let color = deposit === "none" ? "#d5dee6" : DEPOSIT_TILE[deposit];
        if (heat && !isKiln) color = heatHex(building ? buildingWarmth(sim, building) : w);
        const fit: PlacementFit | null = buildKind && !isKiln ? assessPlacement(sim, buildKind, tile.q, tile.r) : null;
        // Occupied tiles just dim; red is kept for open ground this building cannot use.
        if (fit && fit.fit !== "ok") color = FIT_TILE[building && fit.fit === "blocked" ? "poor" : fit.fit];
        const hovered = hover === key;
        if (hovered) {
          color = fit?.fit === "blocked" ? "#b4473f" : "#f2a541";
          const at: [number, number, number] = [x, top + (building || isKiln ? 1.7 : 1.1), z];
          if (fit && buildKind && !building) {
            hoverInfo.label = { at, title: BUILDINGS[buildKind].name, fit: fit.fit, note: fit.note };
          } else {
            const info = describeTile(sim, tile.q, tile.r);
            if (info) hoverInfo.label = { at, title: info.title, note: info.detail };
          }
        }
        return (
          <group key={key} position={[x, y, z]}>
            <mesh
              geometry={hexGeo}
              position={[0, SLAB_HALF - column / 2, 0]}
              scale={[1, column, 1]}
              rotation={[0, Math.PI / 6, 0]}
              receiveShadow
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(key);
              }}
              onPointerOut={() => setHover((h) => (h === key ? null : h))}
              onClick={(e) => {
                e.stopPropagation();
                if (isKiln) {
                  select(null);
                  return;
                }
                if (buildKind && !building) {
                  tryPlace(tile.q, tile.r);
                  return;
                }
                select(building ? building.id : null);
              }}
            >
              <meshStandardMaterial color={color} roughness={0.92} metalness={0.02} />
            </mesh>
            {!building && (deposit === "peat" || deposit === "scrap") && <DepositProp deposit={deposit} />}
            {building && (
              <Structure
                kind={building.kind}
                warmth={buildingWarmth(sim, building)}
                selected={building.id === selectedId}
                heater={building.heater ? (building.heaterFed ? "lit" : "cold") : "none"}
                kilnRunning={sim.kiln.running}
              />
            )}
            {buildKind && hovered && !building && !isKiln && fit?.fit !== "blocked" && (
              <mesh position={[0, 0.45, 0]}>
                <boxGeometry args={[0.7, 0.5, 0.6]} />
                <meshStandardMaterial color="#f2a541" transparent opacity={0.35} />
              </mesh>
            )}
          </group>
        );
      })}
      <HeatRing sim={sim} />
      <Smoke emitters={smoke} />
      {hoverInfo.label && <HoverLabel {...hoverInfo.label} />}
      <group position={[0, kilnTop, 0]}>
        <Kiln
          strain={sim.kiln.strain}
          pressure={sim.kiln.pressure}
          surge={sim.kiln.surge}
          running={sim.kiln.running && sim.kiln.pressure > 0}
          testMode={Boolean(sim.testMode)}
        />
      </group>
    </group>
  );
}

export function CityCanvas() {
  const [ready, setReady] = useState(false);
  const fx = useGame((s) => s.fx);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="absolute inset-0 bg-ink" />;
  return (
    <Canvas
      className="absolute inset-0 touch-none"
      shadows="soft"
      dpr={fx === "high" ? [1, 1.75] : [1, 1.25]}
      camera={{ position: [14, 16, 14], fov: 38, near: 0.1, far: 120 }}
      gl={{ antialias: fx === "low", powerPreference: "high-performance", stencil: false }}
      onPointerMissed={() => useGame.getState().select(null)}
    >
      <SceneLighting quality={fx} clock={skyClock} />
      <City />
      <Snowfall />
      <GroundMist />
      <CameraRig />
      <PostFx quality={fx} />
    </Canvas>
  );
}
