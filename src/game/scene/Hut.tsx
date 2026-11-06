import { useMemo } from "react";
import * as THREE from "three";
import { WINDOW_MATERIALS } from "@/game/scene/Atmosphere";
import { Heater, heaterFlueLocal, type HeaterState } from "@/game/scene/Heater";
import { RidgeSnow, roofSnowSlab, SNOW_COLOR, SnowHeaps } from "@/game/scene/snow";

/*
 * The timber hut: a small log cabin. Stacked log walls crossing at the corners on a stone
 * footing, plank gables under a steep timber roof with snow like the trees', a stone chimney
 * at the back that smokes, a plank door, shuttered windows that glow by warmth at night,
 * a woodpile against the wall and a chopping block by the door.
 *
 * Local units: y = 0 is the tile's slab centre (the tile top is y = 0.1). The hut's length
 * runs along z with the door at +z; the whole hut is turned to face the camera's side.
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

const HW = 0.34; // half width (x)
const HL = 0.42; // half length (z)
const FOOT = 0.06; // stone footing height
const LOG_R = 0.042;
const COURSES = 5;
const COURSE = 0.085;
const WALL_TOP = FOOT + COURSES * COURSE + 0.02;
const RIDGE = WALL_TOP + 0.4;
const EAVE = 0.1; // roof overhang past the long walls
const GABLE_OVER = 0.08; // roof overhang past the gable ends

/** The hut faces the camera's side of the map, like the tents. */
export const HUT_FACING = Math.PI / 4;

/** Chimney mouth in hut-local coordinates (before facing), above the tile top. */
const FLUE_LOCAL = new THREE.Vector3(0.13, RIDGE + 0.2, -(HL + 0.09));

/** Where the chimney smokes, relative to the tile's slab centre. */
export function hutFlue(): [number, number, number] {
  const p = FLUE_LOCAL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), HUT_FACING);
  return [p.x, TILE_TOP + p.y, p.z];
}

/** The heater stands on the front gable, right of the door, where the camera can see it. */
const HEATER_AT: [number, number, number] = [0.22, 0, HL + LOG_R + 0.07];
const HEATER_TURN = 0;

/** Where a lit heater's stovepipe smokes, relative to the tile's slab centre. */
export function hutHeaterFlue(): [number, number, number] {
  const p = heaterFlueLocal(HEATER_AT, HEATER_TURN).applyAxisAngle(new THREE.Vector3(0, 1, 0), HUT_FACING);
  return [p.x, TILE_TOP + p.y, p.z];
}

export function TimberHut({ warmth, selected, heater = "none" }: { warmth: number; selected: boolean; heater?: HeaterState }) {
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
      right: roofSnowSlab(roofLength, slope.length * 0.5, 1.4),
      left: roofSnowSlab(roofLength, slope.length * 0.5, 3.6),
    }),
    [roofLength, slope.length],
  );
  const pane = warmth >= 1 ? WINDOW_MATERIALS.warm : warmth >= 0 ? WINDOW_MATERIALS.mild : WINDOW_MATERIALS.cold;

  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, HUT_FACING, 0]}>
      {/* Stone footing. */}
      <mesh position={[0, FOOT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * HW + 0.12, FOOT, 2 * HL + 0.12]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.95} {...FLAT} />
      </mesh>

      {/* Log walls: long walls on even courses, gable walls half a course up, crossing at the corners. */}
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
      {/* Pale cut ends where the logs cross. */}
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

      {/* Plank gables. */}
      {[-1, 1].map((end) => (
        <mesh key={`gable-${end}`} geometry={gable} position={[0, WALL_TOP, end * HL]} rotation={[0, end === 1 ? 0 : Math.PI, 0]} castShadow>
          <meshStandardMaterial color={PLANK} roughness={0.95} side={THREE.DoubleSide} {...FLAT} />
        </mesh>
      ))}

      {/* Roof: two steep timber slopes with plank lines, and snow like the trees'. */}
      {[-1, 1].map((side) => (
        <group key={`roof-${side}`} position={[side * (HW + EAVE - slope.run / 2), RIDGE - slope.rise / 2, 0]} rotation={[0, 0, side * -slope.angle]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[slope.length, 0.035, roofLength]} />
            <meshStandardMaterial color={ROOF} roughness={0.95} {...FLAT} />
          </mesh>
          {[-0.3, -0.1, 0.1, 0.3].map((z) => (
            <mesh key={z} position={[0, 0.019, z * (roofLength / 0.84)]}>
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
      <RidgeSnow y={RIDGE + 0.04} length={roofLength} count={7} size={1.15} />

      {/* Plank door with a frame and an iron latch. */}
      <group name="door" position={[0, FOOT, HL + LOG_R + 0.012]}>
        <mesh position={[0, 0.19, 0]}>
          <boxGeometry args={[0.24, 0.4, 0.02]} />
          <meshStandardMaterial color={PLANK} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0, 0.18, 0.012]}>
          <boxGeometry args={[0.18, 0.36, 0.015]} />
          <meshStandardMaterial color={DOOR} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0.055, 0.19, 0.022]}>
          <boxGeometry args={[0.025, 0.012, 0.01]} />
          <meshStandardMaterial color={IRON} {...FLAT} />
        </mesh>
      </group>

      {/* Shuttered windows on both long walls: the panes glow by warmth at night. */}
      {[-1, 1].map((side) => (
        <group key={`window-${side}`} position={[side * (HW + LOG_R + 0.006), FOOT + 0.24, -0.04]} rotation={[0, side * (Math.PI / 2), 0]}>
          <mesh>
            <boxGeometry args={[0.2, 0.17, 0.02]} />
            <meshStandardMaterial color={PLANK} roughness={1} {...FLAT} />
          </mesh>
          <mesh position={[0, 0, 0.011]} material={pane}>
            <planeGeometry args={[0.15, 0.12]} />
          </mesh>
          <mesh position={[0, 0, 0.016]}>
            <boxGeometry args={[0.012, 0.12, 0.008]} />
            <meshStandardMaterial color={PLANK} {...FLAT} />
          </mesh>
          <mesh position={[0, 0, 0.016]}>
            <boxGeometry args={[0.15, 0.012, 0.008]} />
            <meshStandardMaterial color={PLANK} {...FLAT} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.14, 0, 0.03]} rotation={[0, s * -0.7, 0]}>
              <boxGeometry args={[0.08, 0.16, 0.012]} />
              <meshStandardMaterial color={LOG_DARK} roughness={1} {...FLAT} />
            </mesh>
          ))}
          <mesh position={[0, -0.095, 0.03]}>
            <boxGeometry args={[0.2, 0.02, 0.04]} />
            <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
          </mesh>
        </group>
      ))}

      {/* Stone chimney against the back gable. */}
      <group position={[FLUE_LOCAL.x, 0, FLUE_LOCAL.z]}>
        {[
          [0.2, 0.0, 0.2],
          [0.18, 0.28, 0.18],
          [0.17, 0.56, 0.17],
          [0.15, 0.82, 0.15],
        ].map(([w, y, d], i) => (
          <mesh key={i} position={[0, y! + 0.15, 0]} rotation={[0, i * 0.05, 0]} castShadow>
            <boxGeometry args={[w!, i === 3 ? FLUE_LOCAL.y - 0.82 : 0.3, d!]} />
            <meshStandardMaterial color={i % 2 ? STONE : STONE_DARK} roughness={0.95} {...FLAT} />
          </mesh>
        ))}
        <mesh position={[0, FLUE_LOCAL.y + 0.02, 0]} castShadow>
          <boxGeometry args={[0.2, 0.04, 0.2]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.95} {...FLAT} />
        </mesh>
        <mesh position={[0, FLUE_LOCAL.y + 0.05, 0]} scale={[1.2, 0.5, 1.2]}>
          <icosahedronGeometry args={[0.08, 0]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      </group>

      {/* Woodpile against the right wall, snow on top. */}
      <group position={[HW + 0.17, FOOT, -0.06]}>
        {[0, 1, 2].flatMap((row) =>
          Array.from({ length: 4 - row }, (_, i) => (
            <mesh key={`wood-${row}-${i}`} position={[0, 0.03 + row * 0.052, (i - (3 - row) / 2) * 0.058]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.028, 0.028, 0.2, 6]} />
              <meshStandardMaterial color={i % 2 ? LOG : LOG_DARK} roughness={1} {...FLAT} />
            </mesh>
          )),
        )}
        <mesh position={[0, 0.18, 0]} scale={[1, 0.35, 1.6]}>
          <icosahedronGeometry args={[0.08, 1]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      </group>

      {/* Chopping block and axe by the door. */}
      <group position={[-0.24, 0, HL + 0.2]}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.06, 0.1, 7]} />
          <meshStandardMaterial color={LOG} roughness={1} {...FLAT} />
        </mesh>
        <mesh position={[0.01, 0.15, 0]} rotation={[0, 0, 0.35]}>
          <cylinderGeometry args={[0.008, 0.008, 0.18, 5]} />
          <meshStandardMaterial color={LOG_END} {...FLAT} />
        </mesh>
        <mesh position={[-0.02, 0.105, 0]} rotation={[0, 0, 0.35]}>
          <boxGeometry args={[0.05, 0.03, 0.012]} />
          <meshStandardMaterial color={IRON} {...FLAT} />
        </mesh>
      </group>

      <Heater state={heater} position={HEATER_AT} rotationY={HEATER_TURN} />

      <SnowHeaps
        at={[
          [HW + 0.12, HL + 0.06, 0.12],
          [-HW - 0.1, HL - 0.1, 0.1],
          [-HW - 0.11, -HL + 0.05, 0.13],
          [-0.15, -HL - 0.1, 0.1],
        ]}
      />
    </group>
  );
}
