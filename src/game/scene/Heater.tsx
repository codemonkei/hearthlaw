import * as THREE from "three";

/*
 * A fitted heater: an iron stove box against an outside wall with a barred grille, and a
 * stovepipe running up the wall past the eave to a capped top. "lit" when it has fuel (the
 * grille glows and the pipe smokes), "cold" when fitted but unfed.
 *
 * Drawn in the owning building's local space: the stove stands on the ground at the given
 * position with its back to the wall, its front facing +z of the given rotation.
 */

export type HeaterState = "none" | "cold" | "lit";

const FLAT = { flatShading: true } as const;
const IRON = "#2a2f34";
const IRON_LIGHT = "#3b4249";
const COPPER = "#7a4a2e";

const GLOW = new THREE.MeshStandardMaterial({ color: "#2a0d05", emissive: "#ff6a22", emissiveIntensity: 2.4, ...FLAT });
const DARK = new THREE.MeshStandardMaterial({ color: "#15181b", roughness: 1, ...FLAT });

/** Height of the stovepipe's mouth above the stove's base (before HEATER_SCALE). */
export const HEATER_PIPE_TOP = 0.86;
export const HEATER_PIPE_OUT = 0.07;
/** The stove is drawn a little larger than life so its grille reads at normal zoom. */
const HEATER_SCALE = 1.25;

export function Heater({
  state,
  position,
  rotationY,
}: {
  state: HeaterState;
  position: [number, number, number];
  rotationY: number;
}) {
  if (state === "none") return null;
  const lit = state === "lit";
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={HEATER_SCALE}>
      {/* Stove box on short legs. */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.15, 0.17, 0.11]} />
        <meshStandardMaterial color={IRON} metalness={0.4} roughness={0.6} {...FLAT} />
      </mesh>
      <mesh position={[0, 0.215, 0]}>
        <boxGeometry args={[0.17, 0.02, 0.13]} />
        <meshStandardMaterial color={IRON_LIGHT} metalness={0.4} roughness={0.6} {...FLAT} />
      </mesh>
      {[-0.06, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.02, 0.03]}>
          <boxGeometry args={[0.02, 0.04, 0.02]} />
          <meshStandardMaterial color={IRON} {...FLAT} />
        </mesh>
      ))}
      {/* Grille: glowing when lit. */}
      <mesh position={[0, 0.115, 0.056]} material={lit ? GLOW : DARK}>
        <planeGeometry args={[0.1, 0.08]} />
      </mesh>
      {[-0.03, 0, 0.03].map((x) => (
        <mesh key={x} position={[x, 0.115, 0.06]}>
          <boxGeometry args={[0.01, 0.085, 0.008]} />
          <meshStandardMaterial color="#111416" {...FLAT} />
        </mesh>
      ))}
      {/* Stovepipe up the wall, with brackets and a cap. */}
      <mesh position={[0.045, 0.23 + (HEATER_PIPE_TOP - 0.23) / 2, -0.02 + HEATER_PIPE_OUT - 0.07]} castShadow>
        <cylinderGeometry args={[0.022, 0.022, HEATER_PIPE_TOP - 0.23, 6]} />
        <meshStandardMaterial color={COPPER} metalness={0.4} roughness={0.55} {...FLAT} />
      </mesh>
      {[0.42, 0.66].map((y) => (
        <mesh key={y} position={[0.045, y, -0.05]}>
          <boxGeometry args={[0.012, 0.012, 0.06]} />
          <meshStandardMaterial color={IRON} {...FLAT} />
        </mesh>
      ))}
      <mesh position={[0.045, HEATER_PIPE_TOP + 0.02, -0.02]}>
        <coneGeometry args={[0.045, 0.04, 6]} />
        <meshStandardMaterial color={IRON} {...FLAT} />
      </mesh>
    </group>
  );
}

/** Where a heater's pipe smokes, in the building's local space (before the building's own facing). */
export function heaterFlueLocal(position: [number, number, number], rotationY: number): THREE.Vector3 {
  return new THREE.Vector3(0.045, HEATER_PIPE_TOP + 0.04, -0.02)
    .multiplyScalar(HEATER_SCALE)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)
    .add(new THREE.Vector3(...position));
}
