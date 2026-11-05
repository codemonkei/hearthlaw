import * as THREE from "three";

/*
 * Snow pieces shared by hand-built buildings, styled like the snow on the nature pack's trees:
 * thick faceted slabs with soft, wavy edges, lumps along ridges, and heaps at the foot of walls.
 */

const FLAT = { flatShading: true } as const;
export const SNOW_COLOR = "#e6edf2";

/**
 * A snow slab for one roof slope. Shape x runs down the slope from the ridge, y along the
 * building; extruded upward off the roof. `cover` is how far down the slope it reaches.
 * Place it at the ridge end of the slope with rotation [-π/2, 0, 0] (mirror x on the far slope).
 */
export function roofSnowSlab(length: number, cover: number, phase: number): THREE.ExtrudeGeometry {
  const half = length / 2 + 0.04;
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
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.016,
    bevelSegments: 1,
    curveSegments: 1,
  });
}

/** Lumps of snow along a ridge running along z, from -length/2 to length/2. */
export function RidgeSnow({ y, length, count = 6, size = 1 }: { y: number; length: number; count?: number; size?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const z = -length / 2 + 0.02 + (i / (count - 1)) * (length - 0.04);
        const r = (0.055 + ((i * 7) % 3) * 0.012) * size;
        return (
          <mesh key={i} position={[0, y, z]} rotation={[0, i * 1.1, 0]} scale={[1.3, 0.55, 1.1]} castShadow>
            <icosahedronGeometry args={[r, 0]} />
            <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
          </mesh>
        );
      })}
    </>
  );
}

/** Soft heaps of snow at given [x, z, radius] spots on the ground (y = 0). */
export function SnowHeaps({ at }: { at: [number, number, number][] }) {
  return (
    <>
      {at.map(([x, z, r], i) => (
        <mesh key={i} position={[x, r * 0.15, z]} rotation={[0, i * 1.3, 0]} scale={[1.25, 0.45, 1]} castShadow receiveShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={SNOW_COLOR} roughness={0.9} {...FLAT} />
        </mesh>
      ))}
    </>
  );
}
