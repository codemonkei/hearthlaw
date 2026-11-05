import { useGLTF } from "@react-three/drei";
import { Component, useMemo, type ReactNode } from "react";
import * as THREE from "three";

/*
 * Shared plumbing for model packs built by scripts/build-*-models.mjs: each GLB holds
 * one named root node per model, and every model is drawn instanced.
 */

/**
 * One mesh of a model. `local` is its transform relative to the model root and is applied
 * per instance, never baked into the geometry: the GLBs are meshopt-quantized, so positions
 * are normalized int16 in [-1, 1] with the real size held in the node transform. Baking
 * would clamp them and slice the model.
 */
export type Part = { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 };

export interface Placement {
  pos: [number, number, number];
  rotY: number;
  scale: number;
  /** A full world transform; when set it is used instead of pos/rotY/scale. */
  matrix?: THREE.Matrix4;
}

/** Load a pack and collect each model's meshes. `material` may replace or adapt each source material. */
export function useModelParts(url: string, material: (src: THREE.Material) => THREE.Material): Map<string, Part[]> {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const cache = new Map<THREE.Material, THREE.Material>();
    const out = new Map<string, Part[]>();
    scene.updateMatrixWorld(true);
    for (const root of scene.children) {
      const inv = root.matrixWorld.clone().invert();
      const parts: Part[] = [];
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
        let m = cache.get(src);
        if (!m) {
          m = material(src);
          cache.set(src, m);
        }
        parts.push({ geometry: mesh.geometry, material: m, local: new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld) });
      });
      out.set(root.name, parts);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
}

export function Instanced({ parts, items }: { parts: Part[]; items: Placement[] }) {
  const placed = useMemo(() => {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    return items.map((it) => {
      if (it.matrix) return it.matrix;
      q.setFromAxisAngle(up, it.rotY);
      return new THREE.Matrix4().compose(new THREE.Vector3(...it.pos), q, new THREE.Vector3(it.scale, it.scale, it.scale));
    });
  }, [items]);
  const scratch = useMemo(() => new THREE.Matrix4(), []);
  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh
          key={`${i}:${items.length}`}
          args={[p.geometry, p.material, items.length]}
          castShadow
          receiveShadow
          ref={(im) => {
            if (!im) return;
            placed.forEach((mx, k) => im.setMatrixAt(k, scratch.multiplyMatrices(mx, p.local)));
            im.instanceMatrix.needsUpdate = true;
            im.computeBoundingSphere();
          }}
        />
      ))}
    </>
  );
}

/** Draw every model in `items` that the pack contains. */
export function PlacedModels({ parts, items }: { parts: Map<string, Part[]>; items: Map<string, Placement[]> }) {
  return (
    <group>
      {[...items].map(([model, list]) => {
        const p = parts.get(model);
        return p && list.length > 0 ? <Instanced key={model} parts={p} items={list} /> : null;
      })}
    </group>
  );
}

/** Falls back to simple shapes if a pack cannot load. */
export class ModelFallback extends Component<{ fallback: ReactNode; label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn(`[Hearthlaw] ${this.props.label} failed to load; using simple shapes.`, err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Stable pseudo-random in [0,1) from integers, so props do not reshuffle every render. */
export function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
