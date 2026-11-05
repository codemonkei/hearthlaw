import { useMemo } from "react";
import * as THREE from "three";
import { WINDOW_MATERIALS } from "@/game/scene/Atmosphere";
import { RidgeSnow, roofSnowSlab, SNOW_COLOR, SnowHeaps } from "@/game/scene/snow";

/*
 * The longhouse: the shared timber hall, the warmest roof in the cirque. A long, low log hall
 * on a stone footing under a long steep roof with snow like the trees', crossed carved boards
 * above both gable peaks, a porch on posts over double doors, three shuttered windows down
 * each long wall that glow by warmth, a stone chimney at the back and a smoke vent on the
 * ridge, a long woodpile, a barrel and a sled.
 *
 * Local units: y = 0 is the tile's slab centre (the tile top is y = 0.1). The hall's length
 * runs along z with the entrance at +z; the whole hall is turned to face the camera's side.
 */

const TILE_TOP = 0.1;
const FLAT = { flatShading: true } as const;

const LOG = "#6a4a33";
const LOG_DARK = "#563b28";
const LOG_END = "#9a7552";
const PLANK = "#5d4330";
const ROOF = "#3f3128";
const ROOF_SEAM = "#2e241d";
const STONE = "#636870";
const STONE_DARK = "#4d5259";
const DOOR = "#3d2a1d";
const IRON = "#2c3136";

const HW = 0.38; // half width (x)
const HL = 0.66; // half length (z)
const FOOT = 0.06;
const LOG_R = 0.044;
const COURSES = 4;
const COURSE = 0.088;
const WALL_TOP = FOOT + COURSES * COURSE + 0.02;
const RIDGE = WALL_TOP + 0.42;
const EAVE = 0.11;
const GABLE_OVER = 0.1;
const WINDOW_Z = [-0.36, 0, 0.36];

/** The longhouse faces the camera's side of the map, like the hut and the tents. */
export const LONGHOUSE_FACING = Math.PI / 4;

/** Chimney and ridge-vent mouths in hall-local coordinates (before facing), above the tile top. */
const FLUES_LOCAL = [new THREE.Vector3(-0.14, RIDGE + 0.2, -(HL + 0.09)), new THREE.Vector3(0, RIDGE + 0.12, 0.05)];

/** Where the longhouse smokes (chimney and ridge vent), relative to the tile's slab centre. */
export function longhouseFlues(): [number, number, number][] {
  return FLUES_LOCAL.map((v) => {
    const p = v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), LONGHOUSE_FACING);
    return [p.x, TILE_TOP + p.y, p.z];
  });
}

export function Longhouse({ warmth, selected }: { warmth: number; selected: boolean }) {
  const logColor = selected ? "#c97a43" : LOG;
  const slope = useMemo(() => {
    const run = HW + EAVE;
    const tan = (RIDGE - WALL_TOP) / HW;
    const rise = run * tan;
    return { length: Math.hypot(run, rise), angle: Math.atan(tan), run, rise };
  }, []);
  const gable = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-HW, 0);
    s.lineTo(HW, 0);
    s.lineTo(0, RIDGE - WALL_TOP);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  const roofLength = 2 * HL + 2 * GABLE_OVER;
  const roofSnow = useMemo(
    () => ({
      right: roofSnowSlab(roofLength, slope.length * 0.5, 0.4),
      left: roofSnowSlab(roofLength, slope.length * 0.5, 2.2),
    }),
    [roofLength, slope.length],
  );
  const pane = warmth >= 1 ? WINDOW_MATERIALS.warm : warmth >= 0 ? WINDOW_MATERIALS.mild : WINDOW_MATERIALS.cold;
  const vent = FLUES_LOCAL[1]!;
  const stack = FLUES_LOCAL[0]!;

  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, LONGHOUSE_FACING, 0]}>
      {/* Stone footing. */}
      <mesh position={[0, FOOT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * HW + 0.12, FOOT, 2 * HL + 0.12]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.95} {...FLAT} />
      </mesh>

      {/* Log walls, crossing at the corners. */}
      {Array.from({ length: COURSES }, (_, k) => (
        <group key={`course-${k}`}>
          {[-1, 1].map((side) => (
            <mesh key={`long-${side}`} position={[side * HW, FOOT + LOG_R + k * COURSE, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[LOG_R, LOG_R, 2 * HL + 0.14, 7]} />
              <meshStandardMaterial color={k % 2 ? LOG_DARK : logColor} roughness={0.95} {...FLAT} />
            </mesh>
          ))}
          {[-1, 1].map((end) => (
            <mesh key={`short-${end}`} position={[0, FOOT + LOG_R + k * COURSE + COURSE / 2, end * HL]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
              <cylinderGeometry args={[LOG_R, LOG_R, 2 * HW + 0.14, 7]} />
              <meshStandardMaterial color={k % 2 ? logColor : LOG_DARK} roughness={0.95} {...FLAT} />
            </mesh>
          ))}
        </group>
      ))}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) =>
          Array.from({ length: COURSES }, (_, k) => (
            <mesh key={`end-${sx}-${sz}-${k}`} position={[sx * HW, FOOT + LOG_R + k * COURSE, sz * (HL + 0.071)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[LOG_R * 0.92, LOG_R * 0.92, 0.004, 7]} />
              <meshStandardMaterial color={LOG_END} roughness={1} {...FLAT} />
            </mesh>
          )),
        ),
      )}

      {/* Plank gables, and crossed carved boards rising above both peaks. */}
      {[-1, 1].map((end) => (
        <group key={`gable-${end}`}>
          <mesh geometry={gable} position={[0, WALL_TOP, end * HL]} rotation={[0, end === 1 ? 0 : Math.PI, 0]} castShadow>
            <meshStandardMaterial color={PLANK} roughness={0.95} side={THREE.DoubleSide} {...FLAT} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              position={[s * 0.07, RIDGE + 0.05, end * (HL + GABLE_OVER - 0.01)]}
              rotation={[0, 0, s * -(Math.PI / 2 - slope.angle)]}
              castShadow
            >
              <boxGeometry args={[0.035, 0.32, 0.03]} />
              <meshStandardMaterial color={LOG_DARK} roughness={1} {...FLAT} />
            </mesh>
          ))}
        </group>
      ))}

      {/* The long roof with plank lines and snow like the trees'. */}
      {[-1, 1].map((side) => (
        <group key={`roof-${side}`} position={[side * (HW + EAVE - slope.run / 2), RIDGE - slope.rise / 2, 0]} rotation={[0, 0, side * -slope.angle]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[slope.length, 0.035, roofLength]} />
            <meshStandardMaterial color={ROOF} roughness={0.95} {...FLAT} />
          </mesh>
          {[-0.5, -0.3, -0.1, 0.1, 0.3, 0.5].map((f) => (
            <mesh key={f} position={[0, 0.019, f * roofLength * 0.95]}>
              <boxGeometry args={[slope.length, 0.004, 0.012]} />
              <meshStandardMaterial color={ROOF_SEAM} roughness={1} {...FLAT} />
            </mesh>
          ))}
          <mesh
            geometry={side === 1 ? roofSnow.right : roofSnow.left}
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
      <RidgeSnow y={RIDGE + 0.04} length={roofLength} count={10} size={1.15} />

      {/* Smoke vent on the ridge: a little louvred roof over the hearth. */}
      <group position={[vent.x, RIDGE, vent.z]}>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.16, 0.1, 0.2]} />
          <meshStandardMaterial color={PLANK} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.115, 0]} castShadow>
          <boxGeometry args={[0.22, 0.03, 0.26]} />
          <meshStandardMaterial color={ROOF} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.14, 0]} scale={[1.4, 0.4, 1.6]}>
          <icosahedronGeometry args={[0.08, 0]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      </group>

      {/* Porch over the double doors: two posts, a small roof, a step. */}
      <group position={[0, FOOT, HL + LOG_R]}>
        {[-1, 1].map((s) => (
          <mesh key={`door-${s}`} position={[s * 0.065, 0.2, 0.012]}>
            <boxGeometry args={[0.12, 0.38, 0.015]} />
            <meshStandardMaterial color={DOOR} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.2, 0.004]}>
          <boxGeometry args={[0.3, 0.42, 0.012]} />
          <meshStandardMaterial color={PLANK} roughness={1} {...FLAT} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={`ring-${s}`} position={[s * 0.025, 0.2, 0.024]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.018, 0.005, 4, 8]} />
            <meshStandardMaterial color={IRON} {...FLAT} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={`post-${s}`} position={[s * 0.2, 0.24, 0.2]} castShadow>
            <cylinderGeometry args={[0.022, 0.025, 0.48, 6]} />
            <meshStandardMaterial color={LOG_DARK} roughness={1} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.5, 0.13]} rotation={[0.35, 0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.03, 0.3]} />
          <meshStandardMaterial color={ROOF} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.525, 0.12]} rotation={[0.35, 0, 0]} scale={[1, 0.3, 1]}>
          <boxGeometry args={[0.44, 0.06, 0.2]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
        <mesh position={[0, -0.02, 0.15]} receiveShadow>
          <boxGeometry args={[0.42, 0.04, 0.24]} />
          <meshStandardMaterial color={STONE} roughness={0.95} {...FLAT} />
        </mesh>
      </group>

      {/* Three shuttered windows down each long wall. */}
      {[-1, 1].flatMap((side) =>
        WINDOW_Z.map((z) => (
          <group key={`window-${side}-${z}`} position={[side * (HW + LOG_R + 0.006), FOOT + 0.2, z]} rotation={[0, side * (Math.PI / 2), 0]}>
            <mesh>
              <boxGeometry args={[0.17, 0.14, 0.02]} />
              <meshStandardMaterial color={PLANK} roughness={1} {...FLAT} />
            </mesh>
            <mesh position={[0, 0, 0.011]} material={pane}>
              <planeGeometry args={[0.13, 0.1]} />
            </mesh>
            <mesh position={[0, 0, 0.016]}>
              <boxGeometry args={[0.01, 0.1, 0.008]} />
              <meshStandardMaterial color={PLANK} {...FLAT} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.12, 0, 0.028]} rotation={[0, s * -0.7, 0]}>
                <boxGeometry args={[0.07, 0.13, 0.012]} />
                <meshStandardMaterial color={LOG_DARK} roughness={1} {...FLAT} />
              </mesh>
            ))}
            <mesh position={[0, -0.08, 0.028]}>
              <boxGeometry args={[0.17, 0.018, 0.04]} />
              <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
            </mesh>
          </group>
        )),
      )}

      {/* Stone chimney against the back gable. */}
      <group position={[stack.x, 0, stack.z]}>
        {[
          [0.21, 0.0],
          [0.19, 0.28],
          [0.18, 0.56],
          [0.16, 0.84],
        ].map(([w, y], i) => (
          <mesh key={i} position={[0, y! + 0.15, 0]} rotation={[0, i * 0.05, 0]} castShadow>
            <boxGeometry args={[w!, i === 3 ? stack.y - 0.84 : 0.3, w!]} />
            <meshStandardMaterial color={i % 2 ? STONE : STONE_DARK} roughness={0.95} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, stack.y + 0.02, 0]} castShadow>
          <boxGeometry args={[0.21, 0.04, 0.21]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.95} {...FLAT} />
        </mesh>
        <mesh position={[0, stack.y + 0.05, 0]} scale={[1.2, 0.5, 1.2]}>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      </group>

      {/* A long woodpile against the left wall, a barrel and a sled by the porch. */}
      <group position={[-HW - 0.17, FOOT, -0.15]}>
        {[0, 1, 2].flatMap((row) =>
          Array.from({ length: 6 - row }, (_, i) => (
            <mesh key={`wood-${row}-${i}`} position={[0, 0.03 + row * 0.052, (i - (5 - row) / 2) * 0.058]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.028, 0.028, 0.2, 6]} />
              <meshStandardMaterial color={i % 2 ? LOG : LOG_DARK} roughness={1} {...FLAT} />
            </mesh>
          )),
        )}
        <mesh position={[0, 0.18, 0]} scale={[1, 0.35, 2.4]}>
          <icosahedronGeometry args={[0.08, 1]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      </group>
      <group position={[HW + 0.1, 0, HL + 0.12]}>
        <mesh position={[0, 0.075, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.05, 0.15, 8]} />
          <meshStandardMaterial color={LOG} roughness={1} {...FLAT} />
        </mesh>
        {[0.03, 0.12].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.056, 0.006, 4, 10]} />
            <meshStandardMaterial color={IRON} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.16, 0]} scale={[1, 0.4, 1]}>
          <icosahedronGeometry args={[0.055, 0]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      </group>
      <group position={[-0.3, 0, HL + 0.3]} rotation={[0, 0.5, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.07, 0.02, 0]}>
            <boxGeometry args={[0.02, 0.025, 0.36]} />
            <meshStandardMaterial color={LOG_DARK} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.17, 0.02, 0.3]} />
          <meshStandardMaterial color={PLANK} {...FLAT} />
        </mesh>
      </group>

      <SnowHeaps
        at={[
          [HW + 0.12, -HL + 0.08, 0.13],
          [HW + 0.1, 0.2, 0.1],
          [-HW - 0.1, HL - 0.05, 0.11],
          [0.18, -HL - 0.1, 0.11],
          [-0.3, -HL - 0.08, 0.09],
        ]}
      />
    </group>
  );
}
