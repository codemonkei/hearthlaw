import { useMemo } from "react";
import * as THREE from "three";
import { WINDOW_MATERIALS } from "@/game/scene/Atmosphere";

/*
 * The canvas tent: a prospector's wall tent. Low canvas walls under a pitched canvas roof on
 * a timber ridge pole, guy ropes out to stakes, the door flaps tied back on a warm interior,
 * a stovepipe through the roof, snow on the ridge and drifted against the walls, and a crate
 * and a little firewood by the door.
 *
 * Local units: y = 0 is the tile's slab centre (the tile top is y = 0.1). The tent's length
 * runs along z with the door at +z; the whole tent is turned to face the camera's side.
 */

const TILE_TOP = 0.1;
const FLAT = { flatShading: true } as const;

const CANVAS = "#cfc3a5";
const CANVAS_SHADE = "#b9ac8c";
const PATCH = "#a99a78";
const SEAM = "#9d8f6f";
const TIMBER = "#5a3e2b";
const ROPE = "#8d7d60";
const SNOW = "#e6edf2";
const STOVE = "#2c3136";

const L = 1.0; // length
const W = 0.74; // width
const WALL = 0.22; // side wall height
const RIDGE = 0.6; // ridge height above the tile top
const EAVE = 0.06; // roof overhang past the walls

/** The tent faces the camera's side of the map. */
export const TENT_FACING = Math.PI / 4;

/** Stovepipe mouth in tent-local coordinates (before facing), above the tile top. */
const FLUE_LOCAL = new THREE.Vector3(0.17, RIDGE + 0.12, -0.28);

/** Where the stovepipe smokes, relative to the tile's slab centre, for chimney smoke. */
export function tentFlue(): [number, number, number] {
  const p = FLUE_LOCAL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), TENT_FACING);
  return [p.x, TILE_TOP + p.y, p.z];
}

/** A thin cylinder from a to b, for guy ropes. */
function Rope({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { position: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), quaternion: q, length: len };
  }, [a, b]);
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[0.006, 0.006, length, 4]} />
      <meshStandardMaterial color={ROPE} roughness={1} {...FLAT} />
    </mesh>
  );
}

export function CanvasTent({ warmth, selected }: { warmth: number; selected: boolean }) {
  const canvasColor = selected ? "#d98a4f" : CANVAS;
  const slope = useMemo(() => {
    const run = W / 2 + EAVE;
    const rise = RIDGE - WALL + (EAVE * (RIDGE - WALL)) / (W / 2);
    return { length: Math.hypot(run, rise), angle: Math.atan2(rise, run), run, rise };
  }, []);
  const gable = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-W / 2, 0);
    s.lineTo(W / 2, 0);
    s.lineTo(W / 2, WALL);
    s.lineTo(0, RIDGE);
    s.lineTo(-W / 2, WALL);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  const doorway = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.17, 0);
    s.lineTo(0.17, 0);
    s.lineTo(0.12, WALL + 0.14);
    s.lineTo(0, RIDGE - 0.08);
    s.lineTo(-0.12, WALL + 0.14);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  const flap = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.2, 0);
    s.lineTo(0.05, RIDGE - 0.12);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  /**
   * Snow on each roof slope, like the snow on the trees: a thick slab covering the upper part
   * of the slope with a soft, lumpy, wavy lower edge, overhanging the gable ends a little.
   * Shape coordinates: x runs down the slope from the ridge, y along the tent.
   */
  const roofSnow = useMemo(() => {
    const make = (phase: number) => {
      const half = L / 2 + 0.04;
      const cover = slope.length * 0.56;
      const edge = (v: number) =>
        cover +
        0.05 * Math.sin(v * 8.5 + phase) +
        0.03 * Math.sin(v * 21 + phase * 2.3) +
        0.025 * Math.max(0, Math.sin(v * 37 + phase * 4.1)); // little sagging tongues
      const shape = new THREE.Shape();
      shape.moveTo(-0.01, -half);
      shape.lineTo(-0.01, half);
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const v = half - (i / steps) * 2 * half;
        shape.lineTo(edge(v), v);
      }
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.014,
        bevelSize: 0.016,
        bevelSegments: 1,
        curveSegments: 1,
      });
      return g;
    };
    return { right: make(0.7), left: make(2.9) };
  }, [slope.length]);
  /** Lumps of snow along the ridge where the two slabs meet. */
  const ridgeLumps = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const z = -L / 2 + 0.02 + (i / 5) * (L - 0.04);
        return { z, r: 0.055 + ((i * 7) % 3) * 0.012, turn: i * 1.1 };
      }),
    [],
  );
  /** Soft heaps of snow at the corners and along the walls. */
  const drifts = useMemo(
    () =>
      [
        [W / 2 + 0.05, -L / 2 + 0.06, 0.13],
        [W / 2 + 0.06, 0.12, 0.1],
        [-W / 2 - 0.05, -L / 2 + 0.1, 0.12],
        [-W / 2 - 0.05, 0.22, 0.09],
        [0.12, -L / 2 - 0.06, 0.11],
      ] as [number, number, number][],
    [],
  );
  const ropes = useMemo(() => {
    const out: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
    for (const side of [-1, 1]) {
      for (const z of [-L / 2 + 0.08, 0, L / 2 - 0.08]) {
        out.push({
          a: new THREE.Vector3(side * (W / 2 + EAVE * 0.6), TILE_TOP + WALL + 0.02, z),
          b: new THREE.Vector3(side * (W / 2 + 0.3), TILE_TOP + 0.02, z * 1.1),
        });
      }
    }
    return out;
  }, []);
  const doorGlow = warmth >= 1 ? WINDOW_MATERIALS.warm : warmth >= 0 ? WINDOW_MATERIALS.mild : WINDOW_MATERIALS.cold;

  return (
    <group position={[0, TILE_TOP, 0]} rotation={[0, TENT_FACING, 0]}>
      {/* Groundsheet. */}
      <mesh position={[0, 0.005, 0.04]} receiveShadow>
        <boxGeometry args={[W + 0.06, 0.01, L + 0.16]} />
        <meshStandardMaterial color="#4b4236" roughness={1} {...FLAT} />
      </mesh>

      {/* Side walls. */}
      {[-1, 1].map((side) => (
        <mesh key={`wall-${side}`} position={[side * (W / 2), WALL / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.02, WALL, L]} />
          <meshStandardMaterial color={CANVAS_SHADE} roughness={0.95} {...FLAT} />
        </mesh>
      ))}

      {/* Roof: two canvas slopes from the eaves to the ridge, with seams and a couple of patches. */}
      {[-1, 1].map((side) => (
        <group key={`roof-${side}`} position={[side * (W / 2 + EAVE - slope.run / 2), WALL - (EAVE * (RIDGE - WALL)) / (W / 2) + slope.rise / 2, 0]} rotation={[0, 0, side * -slope.angle]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[slope.length, 0.018, L + 0.08]} />
            <meshStandardMaterial color={canvasColor} roughness={0.92} {...FLAT} />
          </mesh>
          <mesh
            geometry={side === 1 ? roofSnow.right : roofSnow.left}
            position={[(-side * slope.length) / 2, 0.012, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[side, 1, 1]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={SNOW} roughness={0.9} {...FLAT} />
          </mesh>
          {[-0.33, 0, 0.33].map((z) => (
            <mesh key={z} position={[0, 0.011, z]}>
              <boxGeometry args={[slope.length, 0.004, 0.012]} />
              <meshStandardMaterial color={SEAM} roughness={1} {...FLAT} />
            </mesh>
          ))}
          {side === 1 && (
            <mesh position={[0.04, 0.012, -0.18]} rotation={[0, 0.2, 0]}>
              <boxGeometry args={[0.12, 0.004, 0.1]} />
              <meshStandardMaterial color={PATCH} roughness={1} {...FLAT} />
            </mesh>
          )}
          {side === -1 && (
            <mesh position={[-0.05, 0.012, 0.22]} rotation={[0, -0.3, 0]}>
              <boxGeometry args={[0.09, 0.004, 0.13]} />
              <meshStandardMaterial color={PATCH} roughness={1} {...FLAT} />
            </mesh>
          )}
          {/* Snow settled along the upper part of each slope. */}
        </group>
      ))}

      {/* Gable ends: the back closed, the front a doorway with its flaps tied back. */}
      <mesh geometry={gable} position={[0, 0, -L / 2]} rotation={[0, Math.PI, 0]} castShadow>
        <meshStandardMaterial color={CANVAS_SHADE} roughness={0.95} side={THREE.DoubleSide} {...FLAT} />
      </mesh>
      <mesh geometry={gable} position={[0, 0, L / 2]} castShadow>
        <meshStandardMaterial color={CANVAS_SHADE} roughness={0.95} side={THREE.DoubleSide} {...FLAT} />
      </mesh>
      <mesh geometry={doorway} position={[0, 0, L / 2 + 0.004]} material={doorGlow} />
      {[-1, 1].map((side) => (
        <mesh key={`flap-${side}`} geometry={flap} position={[side * 0.17, 0, L / 2 + 0.01]} rotation={[0, side === 1 ? -0.5 : Math.PI + 0.5, 0]}>
          <meshStandardMaterial color={canvasColor} roughness={0.92} side={THREE.DoubleSide} {...FLAT} />
        </mesh>
      ))}

      {/* Timber: the ridge pole and the poles holding it at each end. */}
      <mesh position={[0, RIDGE + 0.015, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, L + 0.18, 5]} />
        <meshStandardMaterial color={TIMBER} roughness={1} {...FLAT} />
      </mesh>
      {[-1, 1].map((end) => (
        <mesh key={`pole-${end}`} position={[0, (RIDGE + 0.04) / 2, end * (L / 2 + 0.03)]}>
          <cylinderGeometry args={[0.014, 0.016, RIDGE + 0.04, 5]} />
          <meshStandardMaterial color={TIMBER} roughness={1} {...FLAT} />
        </mesh>
      ))}

      {/* Guy ropes out to stakes. */}
      {ropes.map((r, i) => (
        <group key={`rope-${i}`}>
          <Rope a={r.a.clone().setY(r.a.y - TILE_TOP)} b={r.b.clone().setY(r.b.y - TILE_TOP)} />
          <mesh position={[r.b.x, 0.03, r.b.z]} rotation={[0, 0, Math.sign(r.b.x) * 0.3]}>
            <boxGeometry args={[0.02, 0.07, 0.02]} />
            <meshStandardMaterial color={TIMBER} roughness={1} {...FLAT} />
          </mesh>
        </group>
      ))}

      {/* Stovepipe through the back of the roof. */}
      <mesh position={[FLUE_LOCAL.x, (RIDGE - 0.2 + FLUE_LOCAL.y) / 2, FLUE_LOCAL.z]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, FLUE_LOCAL.y - (RIDGE - 0.2), 6]} />
        <meshStandardMaterial color={STOVE} metalness={0.3} roughness={0.7} {...FLAT} />
      </mesh>
      <mesh position={[FLUE_LOCAL.x, FLUE_LOCAL.y + 0.02, FLUE_LOCAL.z]}>
        <coneGeometry args={[0.06, 0.05, 6]} />
        <meshStandardMaterial color={STOVE} {...FLAT} />
      </mesh>

      {/* Snow drifted against the walls, a crate and firewood by the door. */}
      {ridgeLumps.map((l, i) => (
        <mesh key={`ridge-snow-${i}`} position={[0, RIDGE + 0.03, l.z]} rotation={[0, l.turn, 0]} scale={[1.3, 0.55, 1.1]} castShadow>
          <icosahedronGeometry args={[l.r, 0]} />
          <meshStandardMaterial color={SNOW} roughness={0.9} {...FLAT} />
        </mesh>
      ))}
      {drifts.map(([x, z, r], i) => (
        <mesh key={`drift-${i}`} position={[x, r * 0.15, z]} rotation={[0, i * 1.3, 0]} scale={[1.25, 0.45, 1]} castShadow receiveShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={SNOW} roughness={0.9} {...FLAT} />
        </mesh>
      ))}
      <mesh position={[0.32, 0.06, L / 2 + 0.16]} rotation={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.14, 0.12, 0.12]} />
        <meshStandardMaterial color="#6b4a32" roughness={1} {...FLAT} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={`log-${i}`} position={[-0.3, 0.025 + (i === 2 ? 0.04 : 0), L / 2 + 0.14 + (i === 1 ? 0.05 : i === 2 ? 0.025 : 0)]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.2, 6]} />
          <meshStandardMaterial color="#4f3626" roughness={1} {...FLAT} />
        </mesh>
      ))}
    </group>
  );
}
