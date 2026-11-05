import { useMemo } from "react";
import * as THREE from "three";
import { WINDOW_MATERIALS } from "@/game/scene/Atmosphere";
import { RidgeSnow, roofSnowSlab, SNOW_COLOR } from "@/game/scene/snow";

/*
 * Pieces shared by the hand-built workplaces: a steep gable roof with snow like the trees',
 * log walls crossing at the corners, shuttered windows that glow by warmth, a stone chimney,
 * stacked logs, and a helper that turns building-local points into tile coordinates.
 *
 * Local units match the huts: y = 0 is the tile top, the front faces +z, and every building
 * is turned by FACING so its front looks toward the camera's side of the map.
 */

export const TILE_TOP = 0.1;
export const FLAT = { flatShading: true } as const;
export const FACING = Math.PI / 4;
export const SELECTED = "#c97a43";

export const C = {
  log: "#6a4a33",
  logDark: "#563b28",
  logEnd: "#9a7552",
  plank: "#5d4330",
  plankDark: "#4a3526",
  roof: "#3f3128",
  seam: "#2e241d",
  stone: "#636870",
  stoneDark: "#4d5259",
  door: "#3d2a1d",
  iron: "#2c3136",
  rust: "#7a4a30",
  rustDark: "#5a3626",
  peat: "#2a221b",
  peatDark: "#1c1713",
} as const;

const UP = new THREE.Vector3(0, 1, 0);

/** A building-local point (y above the tile top) as an offset from the tile's slab centre. */
export function toTile(local: [number, number, number], facing = FACING): [number, number, number] {
  const p = new THREE.Vector3(...local).applyAxisAngle(UP, facing);
  return [p.x, TILE_TOP + p.y, p.z];
}

export function paneFor(warmth: number) {
  return warmth >= 1 ? WINDOW_MATERIALS.warm : warmth >= 0 ? WINDOW_MATERIALS.mild : WINDOW_MATERIALS.cold;
}

/** A steep two-slope timber roof over walls at ±hw (x), ±hl (z), with plank gables and snow. */
export function GableRoof({
  hw,
  hl,
  wallTop,
  ridge,
  eave = 0.1,
  over = 0.08,
  phase = 1.4,
  gables = true,
  color = C.roof,
  gableColor = C.plank,
  snow = 0.5,
}: {
  hw: number;
  hl: number;
  wallTop: number;
  ridge: number;
  eave?: number;
  over?: number;
  phase?: number;
  gables?: boolean;
  color?: string;
  gableColor?: string;
  snow?: number;
}) {
  const slope = useMemo(() => {
    const run = hw + eave;
    const tan = (ridge - wallTop) / hw;
    const rise = run * tan;
    return { length: Math.hypot(run, rise), angle: Math.atan(tan), run, rise };
  }, [hw, eave, ridge, wallTop]);
  const length = 2 * hl + 2 * over;
  const gable = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(0, ridge - wallTop);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, [hw, ridge, wallTop]);
  const slabs = useMemo(
    () => ({ right: roofSnowSlab(length, slope.length * snow, phase), left: roofSnowSlab(length, slope.length * snow, phase + 2.2) }),
    [length, slope.length, snow, phase],
  );
  const seams = Math.max(2, Math.round(length / 0.2));
  return (
    <>
      {gables &&
        [-1, 1].map((end) => (
          <mesh key={`gable-${end}`} geometry={gable} position={[0, wallTop, end * hl]} rotation={[0, end === 1 ? 0 : Math.PI, 0]} castShadow>
            <meshStandardMaterial color={gableColor} roughness={0.95} side={THREE.DoubleSide} {...FLAT} />
          </mesh>
        ))}
      {[-1, 1].map((side) => (
        <group key={`roof-${side}`} position={[side * (hw + eave - slope.run / 2), ridge - slope.rise / 2, 0]} rotation={[0, 0, side * -slope.angle]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[slope.length, 0.035, length]} />
            <meshStandardMaterial color={color} roughness={0.95} {...FLAT} />
          </mesh>
          {Array.from({ length: seams }, (_, i) => (
            <mesh key={i} position={[0, 0.019, -length / 2 + ((i + 0.5) / seams) * length]}>
              <boxGeometry args={[slope.length, 0.004, 0.012]} />
              <meshStandardMaterial color={C.seam} roughness={1} {...FLAT} />
            </mesh>
          ))}
          <mesh
            geometry={side === 1 ? slabs.right : slabs.left}
            position={[(-side * slope.length) / 2, 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[side, 1, 1]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
          </mesh>
        </group>
      ))}
      <RidgeSnow y={ridge + 0.04} length={length} count={Math.max(4, Math.round(length / 0.14))} size={1.1} />
    </>
  );
}

/**
 * A blanket of snow lying on a flat or gently sloped surface: `width` along x, `depth` along z,
 * with a soft wavy edge hanging over the +z side (turn it with rotationY to move that edge).
 * Same slab as the roofs, so lean-to roofs, bank tops and stacks match the trees' snow.
 */
export function SnowBlanket({
  width,
  depth,
  phase = 1,
  position = [0, 0, 0],
  rotationY = 0,
}: {
  width: number;
  depth: number;
  phase?: number;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const geo = useMemo(() => roofSnowSlab(width - 0.06, depth - 0.07, phase), [width, depth, phase]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group position={[0, 0, -depth / 2 + 0.02]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      </group>
    </group>
  );
}

/** Log walls on a stone footing: long walls along z, gable walls half a course up, crossing at the corners. */
export function LogWalls({
  hw,
  hl,
  foot,
  courses,
  course = 0.085,
  r = 0.042,
  color = C.log,
}: {
  hw: number;
  hl: number;
  foot: number;
  courses: number;
  course?: number;
  r?: number;
  color?: string;
}) {
  return (
    <>
      <mesh position={[0, foot / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * hw + 0.12, foot, 2 * hl + 0.12]} />
        <meshStandardMaterial color={C.stoneDark} roughness={0.95} {...FLAT} />
      </mesh>
      {Array.from({ length: courses }, (_, k) => (
        <group key={k}>
          {[-1, 1].map((side) => (
            <mesh key={`l${side}`} position={[side * hw, foot + r + k * course, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[r, r, 2 * hl + 0.14, 7]} />
              <meshStandardMaterial color={k % 2 ? C.logDark : color} roughness={0.95} {...FLAT} />
            </mesh>
          ))}
          {[-1, 1].map((end) => (
            <mesh key={`s${end}`} position={[0, foot + r + k * course + course / 2, end * hl]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
              <cylinderGeometry args={[r, r, 2 * hw + 0.14, 7]} />
              <meshStandardMaterial color={k % 2 ? color : C.logDark} roughness={0.95} {...FLAT} />
            </mesh>
          ))}
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`e${sx}${sz}`} position={[sx * hw, foot + r + k * course, sz * (hl + 0.071)]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[r * 0.92, r * 0.92, 0.004, 7]} />
                <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
              </mesh>
            )),
          )}
        </group>
      ))}
    </>
  );
}

/** A plank door with a frame and a latch, standing on `y` against a wall facing +z. */
export function Door({ position, width = 0.22, height = 0.38 }: { position: [number, number, number]; width?: number; height?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width + 0.05, height + 0.03, 0.02]} />
        <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[0, height / 2 - 0.01, 0.012]}>
        <boxGeometry args={[width, height - 0.01, 0.015]} />
        <meshStandardMaterial color={C.door} roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[width * 0.28, height / 2, 0.022]}>
        <boxGeometry args={[0.025, 0.012, 0.01]} />
        <meshStandardMaterial color={C.iron} {...FLAT} />
      </mesh>
    </group>
  );
}

/** A shuttered window whose pane glows by warmth; faces +z of its rotation. */
export function ShutterWindow({ position, rotationY = 0, warmth, scale = 1 }: { position: [number, number, number]; rotationY?: number; warmth: number; scale?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <mesh>
        <boxGeometry args={[0.2, 0.17, 0.02]} />
        <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
      </mesh>
      <mesh position={[0, 0, 0.011]} material={paneFor(warmth)}>
        <planeGeometry args={[0.15, 0.12]} />
      </mesh>
      <mesh position={[0, 0, 0.016]}>
        <boxGeometry args={[0.012, 0.12, 0.008]} />
        <meshStandardMaterial color={C.plank} {...FLAT} />
      </mesh>
      <mesh position={[0, 0, 0.016]}>
        <boxGeometry args={[0.15, 0.012, 0.008]} />
        <meshStandardMaterial color={C.plank} {...FLAT} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.14, 0, 0.03]} rotation={[0, s * -0.7, 0]}>
          <boxGeometry args={[0.08, 0.16, 0.012]} />
          <meshStandardMaterial color={C.logDark} roughness={1} {...FLAT} />
        </mesh>
      ))}
      <mesh position={[0, -0.095, 0.03]}>
        <boxGeometry args={[0.2, 0.02, 0.04]} />
        <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
      </mesh>
    </group>
  );
}

/** A tapering stone chimney standing on the ground at [x, z], with its mouth at `top`. */
export function StoneChimney({ x, z, top, width = 0.2 }: { x: number; z: number; top: number; width?: number }) {
  const blocks = Math.max(2, Math.round(top / 0.28));
  const h = top / blocks;
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: blocks }, (_, i) => {
        const w = width * (1 - (i / blocks) * 0.25);
        return (
          <mesh key={i} position={[0, h * (i + 0.5), 0]} rotation={[0, i * 0.05, 0]} castShadow>
            <boxGeometry args={[w, h, w]} />
            <meshStandardMaterial color={i % 2 ? C.stone : C.stoneDark} roughness={0.95} {...FLAT} />
          </mesh>
        );
      })}
      <mesh position={[0, top + 0.02, 0]} castShadow>
        <boxGeometry args={[width * 0.95, 0.04, width * 0.95]} />
        <meshStandardMaterial color={C.stoneDark} roughness={0.95} {...FLAT} />
      </mesh>
      <mesh position={[0, top + 0.05, 0]} scale={[1.2, 0.5, 1.2]}>
        <icosahedronGeometry args={[width * 0.4, 0]} />
        <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
      </mesh>
    </group>
  );
}

/** Logs stacked in a pyramid along x (rows shrink upward), with pale cut ends and a snow cap. */
export function LogStack({
  position,
  rotationY = 0,
  length = 0.2,
  base = 4,
  r = 0.028,
  ends = false,
}: {
  position: [number, number, number];
  rotationY?: number;
  length?: number;
  base?: number;
  r?: number;
  ends?: boolean;
}) {
  const rows = Math.min(base, 3);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: base - row }, (_, i) => {
          const z = (i - (base - row - 1) / 2) * r * 2.05;
          const y = r + row * r * 1.8;
          return (
            <group key={`${row}-${i}`} position={[0, y, z]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[r, r, length, 6]} />
                <meshStandardMaterial color={(i + row) % 2 ? C.log : C.logDark} roughness={1} {...FLAT} />
              </mesh>
              {ends &&
                [-1, 1].map((s) => (
                  <mesh key={s} position={[(s * length) / 2 + s * 0.002, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[r * 0.9, r * 0.9, 0.004, 6]} />
                    <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
                  </mesh>
                ))}
            </group>
          );
        }),
      )}
      <group rotation={[0, Math.PI / 2, 0]}>
        <RidgeSnow y={r * 1.9 + (rows - 1) * r * 1.8} length={length * 0.85} count={Math.max(3, Math.round(length / 0.09))} size={r / 0.055} />
      </group>
    </group>
  );
}

/** A wooden barrel with iron hoops. */
export function Barrel({ position, color = C.plank, band = C.iron }: { position: [number, number, number]; color?: string; band?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.14, 8]} />
        <meshStandardMaterial color={color} roughness={0.9} {...FLAT} />
      </mesh>
      {[0.025, 0.115].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.053, 0.053, 0.012, 8]} />
          <meshStandardMaterial color={band} metalness={0.4} roughness={0.6} {...FLAT} />
        </mesh>
      ))}
      <mesh position={[0, 0.145, 0]} scale={[1, 0.35, 1]}>
        <icosahedronGeometry args={[0.042, 0]} />
        <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
      </mesh>
    </group>
  );
}

/** A small fire: dark logs and a glowing ember core. */
const FIRE = new THREE.MeshStandardMaterial({ color: "#3a1205", emissive: "#ff7a26", emissiveIntensity: 2.6, ...FLAT });
export function Embers({ position, size = 1 }: { position: [number, number, number]; size?: number }) {
  return (
    <group position={position} scale={size}>
      {[0, 1.2, 2.4].map((a) => (
        <mesh key={a} position={[0, 0.02, 0]} rotation={[0, a, Math.PI / 2 - 0.25]}>
          <cylinderGeometry args={[0.014, 0.014, 0.12, 5]} />
          <meshStandardMaterial color={C.peatDark} roughness={1} {...FLAT} />
        </mesh>
      ))}
      <mesh position={[0, 0.035, 0]} material={FIRE} scale={[1, 0.8, 1]}>
        <icosahedronGeometry args={[0.035, 0]} />
      </mesh>
    </group>
  );
}

/** Vertical battens across a wall face of the given width and height, facing +z, from y = 0. */
export function Battens({ width, height, color = C.plankDark, spacing = 0.09 }: { width: number; height: number; color?: string; spacing?: number }) {
  const n = Math.max(1, Math.round(width / spacing));
  return (
    <>
      {Array.from({ length: n + 1 }, (_, i) => (
        <mesh key={i} position={[-width / 2 + (i / n) * width, height / 2, 0]}>
          <boxGeometry args={[0.018, height, 0.012]} />
          <meshStandardMaterial color={color} roughness={1} {...FLAT} />
        </mesh>
      ))}
    </>
  );
}

/** A round pole from point `a` to point `b`. */
export function Pole({ a, b, r = 0.016, color = C.logDark }: { a: [number, number, number]; b: [number, number, number]; r?: number; color?: string }) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  return (
    <mesh position={va.add(vb).multiplyScalar(0.5)} quaternion={q} castShadow>
      <cylinderGeometry args={[r, r, dir.length(), 6]} />
      <meshStandardMaterial color={color} roughness={1} {...FLAT} />
    </mesh>
  );
}

/** A plank crate with darker edge boards, standing on y = 0. */
export function Crate({ position, size = 0.12, rotationY = 0, snow = false }: { position: [number, number, number]; size?: number; rotationY?: number; snow?: boolean }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, size / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color={C.logEnd} roughness={1} {...FLAT} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, size / 2, s * (size / 2 + 0.002)]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[size * 1.25, 0.014, 0.006]} />
          <meshStandardMaterial color={C.plank} roughness={1} {...FLAT} />
        </mesh>
      ))}
      {snow && (
        <mesh position={[0, size + 0.008, 0]} scale={[1.3, 0.4, 1.2]}>
          <icosahedronGeometry args={[size * 0.4, 1]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      )}
    </group>
  );
}

/** A warm-lit lantern hanging from a short iron arm (arm runs along +x from the mount point). */
const LANTERN_GLOW = new THREE.MeshStandardMaterial({ color: "#3a2410", emissive: "#ffb35a", emissiveIntensity: 2.2, ...FLAT });
export function Lantern({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0.04, 0, 0]}>
        <boxGeometry args={[0.08, 0.012, 0.012]} />
        <meshStandardMaterial color={C.iron} {...FLAT} />
      </mesh>
      <mesh position={[0.07, -0.045, 0]} material={LANTERN_GLOW}>
        <boxGeometry args={[0.035, 0.045, 0.035]} />
      </mesh>
      <mesh position={[0.07, -0.012, 0]}>
        <coneGeometry args={[0.03, 0.025, 4]} />
        <meshStandardMaterial color={C.iron} {...FLAT} />
      </mesh>
    </group>
  );
}

/** Glowing hot metal: furnace mouths, fresh castings, vent grilles. */
export const HOT = new THREE.MeshStandardMaterial({ color: "#3a1205", emissive: "#ff6a1e", emissiveIntensity: 2.8, ...FLAT });
