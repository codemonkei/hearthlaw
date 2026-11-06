/*
 * Snow that settles on the buildings in a storm and melts off slowly after it.
 *
 * How much lies on the roofs is worked out from the sim clock alone (the outdoor temperature
 * hour by hour since the watch began), so a reload shows the same cover. It builds over the
 * first hours of a hard storm, holds through it, and clears gradually once the wind drops —
 * faster under the sun than in the dark. Presentation only.
 *
 * Buildings get it two ways: every upward-facing surface of their materials whitens with the
 * cover (a small shader patch), and drifts pile against their walls.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { outdoorTemp } from "@/game/sim/content";
import { useGame } from "@/game/store";

/** 0 bare … 1 deep. Read by every patched material and drift. */
export const snowCover = { value: 0 };

const STEP = 30; // minutes per integration step
const storm = (tempC: number) => Math.min(1, Math.max(0, (-tempC - 25) / 30));

let cacheMinute = -1;
let cacheValue = 0;

/** The cover at a sim minute: integrated from the start of the watch, half an hour at a time. */
export function coverAt(minute: number): number {
  const m = Math.floor(minute / STEP) * STEP;
  if (m === cacheMinute) return cacheValue;
  let c = 0;
  for (let t = 0; t < m; t += STEP) {
    const s = storm(outdoorTemp(t));
    const hour = (t % 1440) / 60;
    const daylight = hour >= 8 && hour < 16;
    if (s > 0.55) c += ((s - 0.55) / 0.45) * 0.13 * (STEP / 60);
    else if (s < 0.45) c -= (daylight ? 0.07 : 0.025) * (STEP / 60);
    c = Math.min(1, Math.max(0, c));
  }
  cacheMinute = m;
  cacheValue = c;
  return c;
}

/** Keeps `snowCover` following the sim clock, eased so it never jumps. */
export function SnowCoverClock() {
  useFrame((_, delta) => {
    const sim = useGame.getState().sim;
    const target = sim ? coverAt(sim.minute) : 0;
    snowCover.value = THREE.MathUtils.damp(snowCover.value, target, 1.5, Math.min(delta, 0.1));
  });
  return null;
}

const SNOW_RGB = "vec3(0.92, 0.945, 0.97)";

/**
 * Teach a standard material to whiten its upward-facing surfaces by `snowCover`. Skips glowing
 * materials (windows, fires) and any that already customise their shader.
 */
function patch(mat: THREE.Material) {
  const m = mat as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial || m.userData.snowPatched) return;
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
  if (m.emissive && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) return;
  if (m.transparent) return;
  m.userData.snowPatched = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = snowCover;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSnowN;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvSnowN = normalize(mat3(modelMatrix) * objectNormal);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uSnow;\nvarying vec3 vSnowN;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Snow lies where the surface faces the sky; more cover reaches further down the slope.
        float snowEdge = mix(0.95, 0.3, uSnow);
        float snowAmt = smoothstep(snowEdge, snowEdge + 0.25, normalize(vSnowN).y) * smoothstep(0.0, 0.25, uSnow);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_RGB}, snowAmt);`,
      );
  };
  m.customProgramCacheKey = () => "snow-v1";
  m.needsUpdate = true;
}

/** Drifts banked against a building's walls, mostly in the lee of the wind (+x). */
const DRIFTS: [number, number, number, number][] = [
  // x, z, width, depth (structure-local, tile ~1 across)
  [0.42, 0.05, 0.42, 0.62],
  [-0.38, -0.25, 0.26, 0.32],
  [0.05, 0.42, 0.34, 0.2],
  [-0.42, 0.18, 0.22, 0.3],
  [0.22, -0.42, 0.32, 0.2],
];

/** Patch every mesh under `root`, except a heater's: the stove stays hot and bare. */
function patchTree(root: THREE.Object3D) {
  if (root.name === "heater") return;
  const mesh = root as THREE.Mesh;
  if (mesh.isMesh) {
    if (Array.isArray(mesh.material)) mesh.material.forEach(patch);
    else if (mesh.material) patch(mesh.material);
  }
  for (const child of root.children) patchTree(child);
}

/** Ground kept clear: in front of each door (folk dig it out) and around a heater (it melts it). */
type KeepOut = [x: number, z: number, radius: number];

const _p = new THREE.Vector3();

/**
 * Wrap a building: patches its materials for roof snow and banks drifts against it, keeping the
 * doorstep and the heater clear. Re-checks after every render, since models add parts (heaters,
 * upgrades) as the city changes.
 */
export function Snowy({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null);
  const group = useRef<THREE.Group>(null);
  const drifts = useRef<THREE.Group>(null);
  const keepOut = useRef<KeepOut[]>([]);
  useLayoutEffect(() => {
    const r = root.current;
    const g = group.current;
    if (!r || !g) return;
    patchTree(g);
    // Where the doors and the heater sit, in this building's own ground plan.
    r.updateWorldMatrix(true, true);
    const out: KeepOut[] = [];
    g.traverse((o) => {
      if (o.name !== "door" && o.name !== "heater") return;
      r.worldToLocal(o.getWorldPosition(_p));
      const d = Math.hypot(_p.x, _p.z) || 1;
      if (o.name === "door") {
        // The step in front of the door, a little out from the wall.
        out.push([_p.x + (_p.x / d) * 0.18, _p.z + (_p.z / d) * 0.18, 0.34]);
      } else {
        out.push([_p.x, _p.z, 0.4]);
      }
    });
    keepOut.current = out;
  });
  useFrame(() => {
    const d = drifts.current;
    if (!d) return;
    const c = snowCover.value;
    d.visible = c > 0.02;
    d.children.forEach((child, i) => {
      const [x, z, w, depth] = DRIFTS[i];
      // Shrink a drift away to nothing where it would bury a doorstep or a heater.
      let clear = 1;
      for (const [kx, kz, kr] of keepOut.current) {
        const dist = Math.hypot(x - kx, z - kz) - Math.max(w, depth) * 0.6;
        clear = Math.min(clear, THREE.MathUtils.smoothstep(dist, kr * 0.4, kr));
      }
      const grow = Math.min(1, Math.max(0, c * 1.4 - i * 0.15)) * clear;
      child.visible = grow > 0.01;
      child.scale.set(w * (0.6 + grow * 0.4), 0.22 * grow + 0.001, depth * (0.6 + grow * 0.4));
    });
  });
  return (
    <group ref={root}>
      <group ref={group}>{children}</group>
      <group ref={drifts} visible={false}>
        {DRIFTS.map(([x, z], i) => (
          <mesh key={i} position={[x, 0.1, z]} receiveShadow raycast={() => null}>
            <sphereGeometry args={[1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#e9eef3" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
