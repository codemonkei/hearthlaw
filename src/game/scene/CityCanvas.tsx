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
  WINDOW_MATERIALS,
  type SmokeEmitter,
} from "@/game/scene/Atmosphere";
import { Nature } from "@/game/scene/Nature";
import { KenneyTiles } from "@/game/scene/Kenney";
import { TownBuildings } from "@/game/scene/Town";

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

function Kiln({
  strain,
  pressure,
  running,
  terrain,
}: {
  strain: number;
  pressure: number;
  running: boolean;
  terrain: Terrain;
}) {
  const light = useRef<THREE.PointLight>(null);
  const core = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = running ? 1.4 + pressure * 0.55 + Math.sin(t * (2 + strain / 400)) * 0.25 : 0.15;
    if (light.current) light.current.intensity = pulse * 4.2;
    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = pulse;
    }
  });
  const y = hexToWorld(0, 0, terrain)[1] - SLAB_HALF;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.15, 1.35, 0.7, 8]} />
        <meshStandardMaterial color="#2a3138" metalness={0.45} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.72, 0.95, 1.05, 10]} />
        <meshStandardMaterial color="#3b4a5c" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={core} position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.7, 10]} />
        <meshStandardMaterial color="#f2a541" emissive="#c8642b" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.48, 0.85, 8]} />
        <meshStandardMaterial color="#c8642b" metalness={0.65} roughness={0.28} />
      </mesh>
      <mesh position={[0, 2.55, 0]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshStandardMaterial color="#f2a541" emissive="#ffb15c" emissiveIntensity={running ? 3.5 : 0.3} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.95, 0.85, Math.sin(a) * 0.95]} rotation={[0, -a, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.07, 0.09, 0.7, 6]} />
            <meshStandardMaterial color="#8d4b28" metalness={0.7} roughness={0.3} />
          </mesh>
        );
      })}
      <pointLight ref={light} position={[0, 2.2, 0]} color="#ff9a3c" distance={18} decay={2} />
      <Embers origin={[0, 2.6, 0]} strength={running ? 0.45 + pressure * 0.18 : 0} />
    </group>
  );
}

/** A lit window: bright amber when the room is warm, a dull ember when it is not. */
function Window({ position, warmth }: { position: [number, number, number]; warmth: number }) {
  return (
    <mesh position={position} material={warmth >= 1 ? WINDOW_MATERIALS.warm : warmth >= 0 ? WINDOW_MATERIALS.mild : WINDOW_MATERIALS.cold}>
      <boxGeometry args={[0.15, 0.12, 0.02]} />
    </mesh>
  );
}

/** Where each building's chimney mouth sits, relative to its tile group, and how thick its smoke is. */
function chimney(kind: BuildingKind): { at: [number, number, number]; strength: number } | null {
  if (kind === "tent" || kind === "vent") return null;
  if (kind === "hut") return { at: [0.72 * 0.25, 0.95, 0], strength: 0.7 };
  if (kind === "longhouse") return { at: [1.15 * 0.25, 0.95, 0], strength: 0.9 };
  const tall = kind === "survey" || kind === "infirmary";
  const strength = kind === "ironworks" || kind === "mess" ? 1 : tall ? 0.6 : 0.35;
  return { at: [0.22, tall ? 1.32 : 0.97, 0], strength };
}

function Structure({ kind, warmth, selected }: { kind: BuildingKind; warmth: number; selected: boolean }) {
  const roof = warmth >= 1 ? "#f2a541" : "#e8eef2";
  const timber = "#6b4632";
  const stone = "#3b4a5c";
  if (kind === "tent") {
    return (
      <mesh position={[0, 0.38, 0]} castShadow>
        <coneGeometry args={[0.55, 0.75, 6]} />
        <meshStandardMaterial color={selected ? "#c8642b" : "#cbb892"} roughness={0.85} />
      </mesh>
    );
  }
  if (kind === "hut" || kind === "longhouse") {
    const wide = kind === "longhouse" ? 1.15 : 0.72;
    return (
      <group>
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[wide, 0.48, 0.62]} />
          <meshStandardMaterial color={timber} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.68, 0]} rotation={[0, 0, 0]} castShadow>
          <coneGeometry args={[kind === "longhouse" ? 0.78 : 0.52, 0.42, 4]} />
          <meshStandardMaterial color={roof} roughness={0.7} />
        </mesh>
        <mesh position={[wide * 0.25, 0.78, 0]}>
          <boxGeometry args={[0.08, 0.28, 0.08]} />
          <meshStandardMaterial color={stone} />
        </mesh>
        {(kind === "longhouse" ? [-0.3, 0.3] : [0]).map((wx) => (
          <Window key={wx} position={[wx, 0.3, 0.315]} warmth={warmth} />
        ))}
      </group>
    );
  }
  if (kind === "vent") {
    return (
      <group>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.22, 0.9, 8]} />
          <meshStandardMaterial color="#c8642b" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#f2a541" emissive="#ffb15c" emissiveIntensity={2.6} />
        </mesh>
      </group>
    );
  }
  const tall = kind === "survey" || kind === "infirmary";
  return (
    <group>
      <mesh position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[0.85, 0.55, 0.7]} />
        <meshStandardMaterial color={kind === "peat" ? "#3a342c" : kind === "mess" ? "#8a5a3c" : stone} roughness={0.75} />
      </mesh>
      <mesh position={[0.22, tall ? 0.95 : 0.75, 0]} castShadow>
        <boxGeometry args={[0.12, tall ? 0.7 : 0.4, 0.12]} />
        <meshStandardMaterial color="#2c3338" />
      </mesh>
      {(kind === "mess" || kind === "infirmary" || kind === "survey" || kind === "ironworks") && (
        <Window position={[-0.18, 0.38, 0.355]} warmth={warmth} />
      )}
      {kind === "wood" && (
        <mesh position={[-0.35, 0.55, 0.2]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.55, 6]} />
          <meshStandardMaterial color="#6b4632" />
        </mesh>
      )}
    </group>
  );
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

/** The original code-drawn buildings, used while the town parts load (or if they cannot). */
function SimpleBuildings({ sim, selectedId }: { sim: SimState; selectedId: number | null }) {
  const smoke: SmokeEmitter[] = [];
  const groups = sim.buildings.map((b) => {
    const [x, top, z] = hexToWorld(b.q, b.r, sim.terrain);
    const y = top - SLAB_HALF;
    const flue = chimney(b.kind);
    if (flue) smoke.push({ pos: [x + flue.at[0], y + flue.at[1], z + flue.at[2]], strength: flue.strength });
    return (
      <group key={b.id} position={[x, y, z]}>
        <Structure kind={b.kind} warmth={buildingWarmth(sim, b)} selected={b.id === selectedId} />
      </group>
    );
  });
  return (
    <group>
      {groups}
      <Smoke emitters={smoke} />
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
  const kenney = useGame((s) => s.tileset) === "kenney";
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
  if (kilnLevel > 0) smoke.push({ pos: [0, kilnTop + 2.75, 0], strength: Math.min(1, 0.35 + kilnLevel * 0.18) });

  return (
    <group>
      <Ground pit={sim.terrain === "pit"} />
      <Nature sim={sim} fallback={<SimpleNature sim={sim} />} tileProps={!kenney} />
      {kenney && <KenneyTiles sim={sim} />}
      {sim.tiles.map((tile) => {
        const [x, top, z] = hexToWorld(tile.q, tile.r, sim.terrain);
        // Group origin stays at the old slab centre so structure offsets are unchanged.
        const y = top - SLAB_HALF;
        // Solid column from the tile top down past the ground (or the pit floor), so nothing floats.
        // With the Kenney kit the column stops just under the kit tile, which supplies the top.
        const sunk = kenney ? 0.06 : 0;
        const column = top - sunk - columnBottom(sim.terrain);
        const key = `${tile.q}:${tile.r}`;
        const isKiln = tile.q === 0 && tile.r === 0;
        const src = sourceAt(sim, tile.q, tile.r);
        const w = band + src;
        const building = sim.buildings.find((b) => b.id === tile.buildingId) ?? null;
        const deposit = liveDeposit(tile);
        // `tint` is any state colour (heat, placement fit, hover); the classic tiles paint it
        // straight onto the column, the Kenney tiles show it on a thin plate above the kit tile.
        let tint: string | null = null;
        if (heat && !isKiln) tint = heatHex(building ? buildingWarmth(sim, building) : w);
        const fit: PlacementFit | null = buildKind && !isKiln ? assessPlacement(sim, buildKind, tile.q, tile.r) : null;
        // Occupied tiles just dim; red is kept for open ground this building cannot use.
        if (fit && fit.fit !== "ok") tint = FIT_TILE[building && fit.fit === "blocked" ? "poor" : fit.fit];
        const hovered = hover === key;
        if (building && building.id === selectedId) tint = "#f2a541";
        if (hovered) {
          tint = fit?.fit === "blocked" ? "#b4473f" : "#f2a541";
          const at: [number, number, number] = [x, top + (building || isKiln ? 1.7 : 1.1), z];
          if (fit && buildKind && !building) {
            hoverInfo.label = { at, title: BUILDINGS[buildKind].name, fit: fit.fit, note: fit.note };
          } else {
            const info = describeTile(sim, tile.q, tile.r);
            if (info) hoverInfo.label = { at, title: info.title, note: info.detail };
          }
        }
        const color = kenney ? "#3b3631" : (tint ?? (deposit === "none" ? "#d5dee6" : DEPOSIT_TILE[deposit]));
        return (
          <group key={key} position={[x, y, z]}>
            <mesh
              geometry={hexGeo}
              position={[0, SLAB_HALF - sunk - column / 2, 0]}
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
            {kenney && tint && (
              <mesh position={[0, SLAB_HALF + 0.03, 0]} rotation={[0, Math.PI / 6, 0]} renderOrder={1}>
                <cylinderGeometry args={[HEX_SIZE * 0.97, HEX_SIZE * 0.97, 0.03, 6]} />
                <meshBasicMaterial color={tint} transparent opacity={0.55} depthWrite={false} />
              </mesh>
            )}
            {/* The kit has no peat: keep our cut seams on its dirt tile. Its rock tile already reads as scrap. */}
            {!building && (deposit === "peat" || (!kenney && deposit === "scrap")) && <DepositProp deposit={deposit} />}
            {buildKind && hovered && !building && !isKiln && fit?.fit !== "blocked" && (
              <mesh position={[0, 0.45, 0]}>
                <boxGeometry args={[0.7, 0.5, 0.6]} />
                <meshStandardMaterial color="#f2a541" transparent opacity={0.35} />
              </mesh>
            )}
          </group>
        );
      })}
      <TownBuildings sim={sim} fallback={<SimpleBuildings sim={sim} selectedId={selectedId} />} />
      <HeatRing sim={sim} />
      <Smoke emitters={smoke} />
      {hoverInfo.label && <HoverLabel {...hoverInfo.label} />}
      <Kiln
        strain={sim.kiln.strain}
        pressure={sim.kiln.pressure}
        running={sim.kiln.running && sim.kiln.pressure > 0}
        terrain={sim.terrain}
      />
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
